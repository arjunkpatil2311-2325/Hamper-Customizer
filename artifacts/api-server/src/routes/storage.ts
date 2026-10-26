import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq, isNull } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { db, storageUploads } from "@workspace/db";
import {
  Router,
  raw,
  type IRouter,
  type Request,
  type Response,
} from "express";
import {
  InvalidUploadTokenError,
  isSupportedImageType,
  maxUploadedImageSize,
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import {
  getCustomerId,
  isStudioAdmin,
  requireCustomer,
} from "../middlewares/customerAuth";
import { errorPayload } from "../lib/httpErrors";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const uploadIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const parseImageUpload = raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: maxUploadedImageSize,
});

router.post(
  "/storage/uploads/request-url",
  requireCustomer,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getCustomerId(req);
    if (!userId) {
      res.status(401).json(errorPayload("Sign in required"));
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        errorPayload("Choose a JPG, PNG, or WEBP image up to 4 MB."),
      );
      return;
    }

    const { name, size, contentType } = parsed.data;
    const id = randomUUID();
    const objectPath = `/objects/uploads/${id}`;

    try {
      const { uploadURL, uploadToken } = objectStorage.createUploadURL({
        id,
        userId,
        contentType,
        size,
      });

      await db.insert(storageUploads).values({
        objectPath,
        userId,
        contentType,
        size,
      });

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          uploadToken,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating private upload URL");
      res.status(500).json(
        errorPayload("Photo upload is unavailable right now."),
      );
    }
  },
);

router.put(
  "/storage/uploads/:id",
  requireCustomer,
  (req, res, next) => {
    parseImageUpload(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      const status = (error as { status?: number }).status;
      if (status === 413) {
        res.status(413).json(errorPayload("Choose an image up to 4 MB."));
        return;
      }
      if (status === 415) {
        res.status(415).json(
          errorPayload("Choose a JPEG, PNG, or WebP image."),
        );
        return;
      }

      next(error);
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const userId = getCustomerId(req);
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] ?? "" : rawId;
    const token = req.get("x-upload-token") ?? "";
    const contentType = req.get("content-type") ?? "";
    const body = Buffer.isBuffer(req.body) ? req.body : null;

    if (!userId) {
      res.status(401).json(errorPayload("Sign in required"));
      return;
    }
    if (!uploadIdPattern.test(id)) {
      res.status(400).json(errorPayload("Invalid upload"));
      return;
    }
    if (!isSupportedImageType(contentType) || !body || body.length < 1) {
      res.status(400).json(
        errorPayload("Choose a JPEG, PNG, or WebP image up to 4 MB."),
      );
      return;
    }

    const objectPath = `/objects/uploads/${id}`;

    try {
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

      if (!upload) {
        res.status(404).json(errorPayload("Upload not found or already used."));
        return;
      }

      objectStorage.validateUploadToken(token, {
        id,
        userId,
        contentType: upload.contentType,
        size: upload.size,
      });

      if (
        contentType !== upload.contentType ||
        body.length !== upload.size ||
        body.length > maxUploadedImageSize
      ) {
        res.status(400).json(
          errorPayload("The uploaded image does not match its upload request."),
        );
        return;
      }

      await objectStorage.uploadObjectEntity(id, contentType, body);
      res.status(204).end();
    } catch (error) {
      if (error instanceof InvalidUploadTokenError) {
        res.status(400).json(errorPayload(error.message));
        return;
      }

      req.log.error({ err: error }, "Unable to save private image");
      res.status(500).json(errorPayload("The image could not be saved."));
    }
  },
);

router.get(
  "/storage/objects/*path",
  requireCustomer,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getCustomerId(req);
    if (!userId) {
      res.status(401).json(errorPayload("Sign in required"));
      return;
    }

    const rawPath = req.params.path;
    const wildcardPath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const objectPath = `/objects/${wildcardPath}`;

    try {
      const [upload] = await db
        .select()
        .from(storageUploads)
        .where(eq(storageUploads.objectPath, objectPath))
        .limit(1);

      if (!upload) {
        res.status(404).json(errorPayload("Photo not found"));
        return;
      }

      if (upload.userId !== userId && !(await isStudioAdmin(req))) {
        res.status(403).json(
          errorPayload("You do not have access to this photo"),
        );
        return;
      }

      const object = await objectStorage.getObjectEntity(objectPath);
      res.status(object.statusCode);
      res.setHeader("Content-Type", object.blob.contentType);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", String(object.blob.size));
      Readable.fromWeb(object.stream).pipe(res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json(errorPayload("Photo not found"));
        return;
      }

      req.log.error({ err: error }, "Error serving private photo");
      res.status(500).json(errorPayload("Failed to serve private photo"));
    }
  },
);

export default router;
