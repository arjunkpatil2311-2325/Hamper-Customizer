import { Readable } from "node:stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { db, storageUploads } from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectPermission } from "../lib/objectAcl";
import {
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
        errorPayload("Choose a JPG, PNG, or WEBP image up to 5 MB."),
      );
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      const uploadURL = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);

      await db.insert(storageUploads).values({
        objectPath,
        userId,
        contentType,
        size,
      });

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
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

router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawPath = req.params.filePath;
      const filePath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
      const file = await objectStorage.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json(errorPayload("File not found"));
        return;
      }

      const response = await objectStorage.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json(
        errorPayload("Failed to serve public object"),
      );
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

    try {
      const rawPath = req.params.path;
      const wildcardPath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile = await objectStorage.getObjectEntityFile(objectPath);
      const canRead = await objectStorage.canAccessObjectEntity({
        userId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });

      if (!canRead && !(await isStudioAdmin(req))) {
        res.status(403).json(
          errorPayload("You do not have access to this photo"),
        );
        return;
      }

      const response = await objectStorage.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json(errorPayload("Photo not found"));
        return;
      }

      req.log.error({ err: error }, "Error serving private photo");
      res.status(500).json(
        errorPayload("Failed to serve private photo"),
      );
    }
  },
);

export default router;
