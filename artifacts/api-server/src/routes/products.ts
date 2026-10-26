import { Readable } from "node:stream";
import { eq, and, gt } from "drizzle-orm";
import {
  GetProductImageParams,
  ListProductsResponse,
} from "@workspace/api-zod";
import { db, productImages, products } from "@workspace/db";
import { Router, type IRouter } from "express";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { errorPayload } from "../lib/httpErrors";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

router.get("/products", async (_req, res): Promise<void> => {
  try {
    const catalog = await db
      .select()
      .from(products)
      .where(and(eq(products.active, true), gt(products.stock, 0)))
      .orderBy(products.name);

    res.json(ListProductsResponse.parse(catalog));
  } catch (error) {
    _req.log.error({ err: error }, "Unable to load product catalog");
    res.status(500).json(errorPayload("The product catalog is unavailable."));
  }
});

router.get("/products/images/:id", async (req, res): Promise<void> => {
  const params = GetProductImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json(errorPayload("Invalid product image"));
    return;
  }

  try {
    const [image] = await db
      .select()
      .from(productImages)
      .where(eq(productImages.id, params.data.id))
      .limit(1);

    if (!image) {
      res.status(404).json(errorPayload("Product image not found"));
      return;
    }

    const response = await objectStorage.getObjectEntity(image.objectPath);
    res.status(response.statusCode);
    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", String(response.blob.size));
    res.setHeader("X-Content-Type-Options", "nosniff");
    Readable.fromWeb(response.stream).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json(errorPayload("Product image not found"));
      return;
    }

    req.log.error({ err: error }, "Unable to serve product image");
    res.status(500).json(errorPayload("The product image is unavailable."));
  }
});

export default router;
