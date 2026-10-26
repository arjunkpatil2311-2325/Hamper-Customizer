import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  ArchiveAdminProductParams,
  ArchiveAdminProductResponse,
  CreateAdminProductBody,
  CreateAdminProductResponse,
  ListAdminProductsResponse,
  UpdateAdminProductBody,
  UpdateAdminProductParams,
  UpdateAdminProductResponse,
} from "@workspace/api-zod";
import { db, productImages, products, storageUploads } from "@workspace/db";
import { Router, type IRouter } from "express";
import { errorPayload } from "../lib/httpErrors";
import {
  ObjectNotFoundError,
  ObjectStorageService,
  maxUploadedImageSize,
} from "../lib/objectStorage";
import { getCustomerId, requireStudioAdmin } from "../middlewares/customerAuth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

class InvalidProductImageError extends Error {}

async function verifyProductImageUpload(
  objectPath: string,
  userId: string,
): Promise<{ contentType: string }> {
  if (!/^\/objects\/uploads\/[A-Za-z0-9_-]+$/.test(objectPath)) {
    throw new InvalidProductImageError("Choose a valid product image.");
  }

  const [upload] = await db
    .select()
    .from(storageUploads)
    .where(
      and(
        eq(storageUploads.objectPath, objectPath),
        eq(storageUploads.userId, userId),
        isNull(storageUploads.claimedAt),
      ),
    )
    .limit(1);

  if (!upload || upload.size < 1 || upload.size > maxUploadedImageSize) {
    throw new InvalidProductImageError(
      "Upload a new JPEG, PNG or WebP image up to 4 MB.",
    );
  }

  let metadata: { size: number; contentType: string };
  try {
    metadata = await objectStorage.getObjectEntityMetadata(objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new InvalidProductImageError(
        "The uploaded image could not be found. Please upload it again.",
      );
    }
    throw error;
  }
  const actualSize = metadata.size;
  const actualType = metadata.contentType;
  if (
    !allowedImageTypes.has(upload.contentType) ||
    actualType !== upload.contentType ||
    !Number.isSafeInteger(actualSize) ||
    actualSize < 1 ||
    actualSize !== upload.size ||
    actualSize > maxUploadedImageSize
  ) {
    throw new InvalidProductImageError(
      "The uploaded file must be a JPEG, PNG or WebP image up to 4 MB.",
    );
  }

  return { contentType: actualType };
}

function invalidProductFields(
  value: { name: string; description: string; imageAlt: string },
): boolean {
  return !value.name.trim() || !value.description.trim() || !value.imageAlt.trim();
}

router.get(
  "/admin/products",
  requireStudioAdmin,
  async (req, res): Promise<void> => {
    try {
      const catalog = await db
        .select()
        .from(products)
        .orderBy(asc(products.name));
      res.json(ListAdminProductsResponse.parse(catalog));
    } catch (error) {
      req.log.error({ err: error }, "Unable to load studio products");
      res.status(500).json(errorPayload("Studio products are unavailable."));
    }
  },
);

router.post(
  "/admin/products",
  requireStudioAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateAdminProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorPayload("Please complete the product details and image."));
      return;
    }
    const imageObjectPath = parsed.data.imageObjectPath;
    if (!imageObjectPath) {
      res.status(400).json(errorPayload("Please complete the product details and image."));
      return;
    }
    if (invalidProductFields(parsed.data)) {
      res.status(400).json(errorPayload("Product name, description and image description are required."));
      return;
    }

    const userId = getCustomerId(req);
    if (!userId) {
      res.status(401).json(errorPayload("Sign in required"));
      return;
    }

    try {
      const image = await verifyProductImageUpload(imageObjectPath, userId);
      const id = randomUUID();
      const imageId = randomUUID();
      const product = await db.transaction(async (tx) => {
        const [upload] = await tx
          .select()
          .from(storageUploads)
          .where(
            and(
              eq(storageUploads.objectPath, imageObjectPath),
              eq(storageUploads.userId, userId),
              isNull(storageUploads.claimedAt),
            ),
          )
          .for("update")
          .limit(1);

        if (!upload) {
          throw new InvalidProductImageError("Please upload your product image again.");
        }

        await tx.insert(productImages).values({
          id: imageId,
          objectPath: imageObjectPath,
          contentType: image.contentType,
        });
        await tx
          .update(storageUploads)
          .set({ claimedAt: new Date() })
          .where(eq(storageUploads.objectPath, imageObjectPath));

        const [created] = await tx
          .insert(products)
          .values({
            id,
            name: parsed.data.name.trim(),
            description: parsed.data.description.trim(),
            category: parsed.data.category,
            price: parsed.data.price,
            imageUrl: `/api/products/images/${imageId}`,
            imageAlt: parsed.data.imageAlt.trim(),
            imageId,
            stock: parsed.data.stock,
            active: parsed.data.active,
            featured: false,
          })
          .returning();

        return created;
      });

      res.status(201).json(CreateAdminProductResponse.parse(product));
    } catch (error) {
      if (error instanceof InvalidProductImageError) {
        res.status(400).json(errorPayload(error.message));
        return;
      }

      req.log.error({ err: error }, "Unable to create studio product");
      res.status(500).json(errorPayload("The product could not be saved."));
    }
  },
);

router.put(
  "/admin/products/:id",
  requireStudioAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminProductParams.safeParse(req.params);
    const parsed = UpdateAdminProductBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json(errorPayload("Please check the product details."));
      return;
    }
    if (parsed.data.imageObjectPath !== undefined && !parsed.data.imageObjectPath) {
      res.status(400).json(errorPayload("Choose a valid product image."));
      return;
    }
    if (invalidProductFields(parsed.data)) {
      res.status(400).json(errorPayload("Product name, description and image description are required."));
      return;
    }

    const userId = getCustomerId(req);
    if (!userId) {
      res.status(401).json(errorPayload("Sign in required"));
      return;
    }

    try {
      const image = parsed.data.imageObjectPath
        ? await verifyProductImageUpload(parsed.data.imageObjectPath, userId)
        : null;
      const imageId = image ? randomUUID() : null;
      const updated = await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(products)
          .where(eq(products.id, params.data.id))
          .for("update")
          .limit(1);

        if (!current) {
          return null;
        }

        if (parsed.data.imageObjectPath && image && imageId) {
          const [upload] = await tx
            .select()
            .from(storageUploads)
            .where(
              and(
                eq(storageUploads.objectPath, parsed.data.imageObjectPath),
                eq(storageUploads.userId, userId),
                isNull(storageUploads.claimedAt),
              ),
            )
            .for("update")
            .limit(1);

          if (!upload) {
            throw new InvalidProductImageError("Please upload your product image again.");
          }

          await tx.insert(productImages).values({
            id: imageId,
            objectPath: parsed.data.imageObjectPath,
            contentType: image.contentType,
          });
          await tx
            .update(storageUploads)
            .set({ claimedAt: new Date() })
            .where(eq(storageUploads.objectPath, parsed.data.imageObjectPath));
        }

        const [saved] = await tx
          .update(products)
          .set({
            name: parsed.data.name.trim(),
            description: parsed.data.description.trim(),
            category: parsed.data.category,
            price: parsed.data.price,
            imageAlt: parsed.data.imageAlt.trim(),
            ...(imageId
              ? {
                  imageId,
                  imageUrl: `/api/products/images/${imageId}`,
                }
              : {}),
            stock: parsed.data.stock,
            active: parsed.data.active,
            updatedAt: new Date(),
          })
          .where(eq(products.id, params.data.id))
          .returning();

        return saved;
      });

      if (!updated) {
        res.status(404).json(errorPayload("Product not found"));
        return;
      }

      res.json(UpdateAdminProductResponse.parse(updated));
    } catch (error) {
      if (error instanceof InvalidProductImageError) {
        res.status(400).json(errorPayload(error.message));
        return;
      }

      req.log.error({ err: error }, "Unable to update studio product");
      res.status(500).json(errorPayload("The product could not be updated."));
    }
  },
);

router.delete(
  "/admin/products/:id",
  requireStudioAdmin,
  async (req, res): Promise<void> => {
    const params = ArchiveAdminProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json(errorPayload("Invalid product"));
      return;
    }

    try {
      const [archived] = await db
        .update(products)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(products.id, params.data.id))
        .returning();

      if (!archived) {
        res.status(404).json(errorPayload("Product not found"));
        return;
      }

      res.json(ArchiveAdminProductResponse.parse(archived));
    } catch (error) {
      req.log.error({ err: error }, "Unable to archive studio product");
      res.status(500).json(errorPayload("The product could not be archived."));
    }
  },
);

export default router;
