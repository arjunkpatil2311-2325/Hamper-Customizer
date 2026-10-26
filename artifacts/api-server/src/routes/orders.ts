import { randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
} from "drizzle-orm";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetAdminAccessResponse,
  GetOrderParams,
  GetOrderResponse,
  ListAdminOrdersResponse,
  ListOrdersResponse,
  UpdateAdminOrderStatusBody,
  UpdateAdminOrderStatusParams,
  UpdateAdminOrderStatusResponse,
} from "@workspace/api-zod";
import { db, hamperOrders, products, storageUploads } from "@workspace/db";
import { Router, type IRouter } from "express";
import {
  getCustomerId,
  isStudioAdmin,
  requireCustomer,
  requireStudioAdmin,
} from "../middlewares/customerAuth";
import { errorPayload } from "../lib/httpErrors";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const packagingFees = {
  none: 0,
  signature: 89,
  celebration: 149,
} as const;
const deliveryFee = 79;

class OrderRequestError extends Error {}

router.get(
  "/admin/access",
  requireCustomer,
  async (req, res): Promise<void> => {
    try {
      res.json(
        GetAdminAccessResponse.parse({ isAdmin: await isStudioAdmin(req) }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Unable to check studio access");
      res.status(503).json(errorPayload("Studio access is temporarily unavailable"));
    }
  },
);

router.get(
  "/admin/orders",
  requireStudioAdmin,
  async (req, res): Promise<void> => {
    const orders = await db
      .select()
      .from(hamperOrders)
      .orderBy(desc(hamperOrders.createdAt));

    res.json(ListAdminOrdersResponse.parse(orders));
  },
);

router.patch(
  "/admin/orders/:id/status",
  requireStudioAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminOrderStatusParams.safeParse(req.params);
    const body = UpdateAdminOrderStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json(errorPayload("Choose a valid order status"));
      return;
    }

    const [order] = await db
      .update(hamperOrders)
      .set({ status: body.data.status })
      .where(eq(hamperOrders.id, params.data.id))
      .returning();

    if (!order) {
      res.status(404).json(errorPayload("Order not found"));
      return;
    }

    res.json(UpdateAdminOrderStatusResponse.parse(order));
  },
);

router.get("/orders", requireCustomer, async (req, res): Promise<void> => {
  const userId = getCustomerId(req);
  if (!userId) {
    res.status(401).json(errorPayload("Sign in required"));
    return;
  }

  const orders = await db
    .select()
    .from(hamperOrders)
    .where(eq(hamperOrders.userId, userId))
    .orderBy(desc(hamperOrders.createdAt));

  res.json(ListOrdersResponse.parse(orders));
});

router.get("/orders/:id", requireCustomer, async (req, res): Promise<void> => {
  const userId = getCustomerId(req);
  if (!userId) {
    res.status(401).json(errorPayload("Sign in required"));
    return;
  }

  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(errorPayload("Invalid order id"));
    return;
  }

  const [order] = await db
    .select()
    .from(hamperOrders)
    .where(and(eq(hamperOrders.id, params.data.id), eq(hamperOrders.userId, userId)))
    .limit(1);

  if (!order) {
    res.status(404).json(errorPayload("Order not found"));
    return;
  }

  res.json(GetOrderResponse.parse(order));
});

router.post("/orders", requireCustomer, async (req, res): Promise<void> => {
  const userId = getCustomerId(req);
  if (!userId) {
    res.status(401).json(errorPayload("Sign in required"));
    return;
  }

  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(errorPayload("Please check your hamper details"));
    return;
  }

  const input = parsed.data;
  const requestedProductIds = input.items.map((item) => item.productId);
  if (new Set(requestedProductIds).size !== requestedProductIds.length) {
    res.status(400).json(errorPayload("Each hamper item can only be added once."));
    return;
  }
  const productIds = [...requestedProductIds].sort();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (input.deliveryDate < today) {
    res.status(400).json(
      errorPayload("Choose a delivery date that is today or later."),
    );
    return;
  }

  const photoObjectPath = input.photoObjectPath ?? null;
  if (photoObjectPath && !photoObjectPath.startsWith("/objects/uploads/")) {
    res.status(400).json(errorPayload("Invalid photo upload"));
    return;
  }

  const id = randomUUID();
  try {
    const order = await db.transaction(async (tx) => {
      const catalog = await tx
        .select()
        .from(products)
        .where(inArray(products.id, productIds))
        .orderBy(products.id)
        .for("update");
      const catalogById = new Map(catalog.map((product) => [product.id, product]));

      const items = input.items.map((item) => {
        const product = catalogById.get(item.productId);
        if (!product || !product.active || product.stock < item.quantity) {
          throw new OrderRequestError(
            "One or more hamper items are unavailable or out of stock.",
          );
        }

        return {
          productId: product.id,
          name: product.name,
          category: product.category,
          quantity: item.quantity,
          unitPrice: product.price,
          imageUrl: product.imageUrl,
          imageAlt: product.imageAlt,
        };
      });
      const itemsSubtotal = items.reduce(
        (subtotal, item) => subtotal + item.unitPrice * item.quantity,
        0,
      );
      const packagingFee = packagingFees[input.packagingOption];
      const total = itemsSubtotal + packagingFee + deliveryFee;

      if (total > input.budget) {
        throw new OrderRequestError(
          "Your hamper total is over budget. Adjust your items or budget and try again.",
        );
      }

      if (photoObjectPath) {
        const [upload] = await tx
          .select()
          .from(storageUploads)
          .where(
            and(
              eq(storageUploads.objectPath, photoObjectPath),
              eq(storageUploads.userId, userId),
              isNull(storageUploads.claimedAt),
            ),
          )
          .for("update")
          .limit(1);

        if (!upload) {
          throw new Error("PHOTO_UPLOAD_NOT_AVAILABLE");
        }

        let photoMetadata: { size: number; contentType: string };
        try {
          photoMetadata =
            await objectStorage.getObjectEntityMetadata(photoObjectPath);
        } catch (error) {
          if (error instanceof ObjectNotFoundError) {
            throw new OrderRequestError(
              "Please upload your photo again before placing the order.",
            );
          }
          throw error;
        }
        if (
          photoMetadata.size !== upload.size ||
          photoMetadata.contentType !== upload.contentType
        ) {
          throw new OrderRequestError(
            "Please upload your photo again before placing the order.",
          );
        }

        await tx
          .update(storageUploads)
          .set({ claimedAt: new Date() })
          .where(eq(storageUploads.objectPath, photoObjectPath));
      }

      for (const item of input.items) {
        const product = catalogById.get(item.productId);
        if (!product) {
          throw new OrderRequestError(
            "One or more hamper items are unavailable or out of stock.",
          );
        }

        await tx
          .update(products)
          .set({
            stock: product.stock - item.quantity,
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id));
      }

      const [created] = await tx
        .insert(hamperOrders)
        .values({
          id,
          userId,
          status: "placed",
          items,
          budget: input.budget,
          itemsSubtotal,
          packagingFee,
          deliveryFee,
          total,
          packagingOption: input.packagingOption,
          personalizationName: input.personalizationName ?? null,
          giftMessage: input.giftMessage ?? null,
          photoObjectPath,
          deliveryDate: input.deliveryDate.toISOString().slice(0, 10),
          deliveryAddress: {
            ...input.deliveryAddress,
            addressLine2: input.deliveryAddress.addressLine2 ?? null,
          },
        })
        .returning();

      return created;
    });

    res.status(201).json(CreateOrderResponse.parse(order));
  } catch (error) {
    if (error instanceof OrderRequestError) {
      res.status(400).json(errorPayload(error.message));
      return;
    }

    if (error instanceof Error && error.message === "PHOTO_UPLOAD_NOT_AVAILABLE") {
      res.status(400).json(
        errorPayload("Please upload your photo again before placing the order."),
      );
      return;
    }

    req.log.error({ err: error }, "Failed to create hamper order");
    res.status(500).json(
      errorPayload("We couldn't save your order. Please try again."),
    );
  }
});

export default router;
