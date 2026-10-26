import { createHmac, timingSafeEqual } from "node:crypto";
import { BlobNotFoundError, get, head, put } from "@vercel/blob";

const maxImageSize = 4 * 1024 * 1024;
const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
type UploadTokenPayload = {
  id: string;
  userId: string;
  contentType: string;
  size: number;
  expiresAt: number;
};

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class InvalidUploadTokenError extends Error {
  constructor() {
    super("The upload link has expired or is invalid. Request a new upload link.");
    this.name = "InvalidUploadTokenError";
    Object.setPrototypeOf(this, InvalidUploadTokenError.prototype);
  }
}

export class ObjectStorageService {
  createUploadURL({
    id,
    userId,
    contentType,
    size,
  }: Omit<UploadTokenPayload, "expiresAt">): {
    uploadURL: string;
    uploadToken: string;
  } {
    const payload: UploadTokenPayload = {
      id,
      userId,
      contentType,
      size,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.sign(encoded);
    return {
      uploadURL: `/api/storage/uploads/${id}`,
      uploadToken: `${encoded}.${signature}`,
    };
  }

  validateUploadToken(
    token: string,
    expected: Pick<UploadTokenPayload, "id" | "userId" | "contentType" | "size">,
  ): void {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) {
      throw new InvalidUploadTokenError();
    }

    const expectedSignature = this.sign(encoded);
    const providedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expectedSignature);
    if (
      providedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(providedBytes, expectedBytes)
    ) {
      throw new InvalidUploadTokenError();
    }

    let payload: UploadTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as UploadTokenPayload;
    } catch {
      throw new InvalidUploadTokenError();
    }

    if (
      payload.id !== expected.id ||
      payload.userId !== expected.userId ||
      payload.contentType !== expected.contentType ||
      payload.size !== expected.size ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      throw new InvalidUploadTokenError();
    }
  }

  async uploadObjectEntity(
    id: string,
    contentType: string,
    body: Buffer,
  ): Promise<void> {
    if (!allowedImageTypes.has(contentType) || body.length < 1 || body.length > maxImageSize) {
      throw new Error("The uploaded image has invalid content or size.");
    }

    await put(`uploads/${id}`, body, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
  }

  async getObjectEntityMetadata(objectPath: string): Promise<{
    size: number;
    contentType: string;
  }> {
    const pathname = this.getBlobPath(objectPath);
    try {
      const blob = await head(pathname);
      return { size: blob.size, contentType: blob.contentType };
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        throw new ObjectNotFoundError();
      }
      throw error;
    }
  }

  async getObjectEntity(objectPath: string) {
    const pathname = this.getBlobPath(objectPath);
    try {
      const blob = await get(pathname, { access: "private" });
      if (!blob || blob.statusCode !== 200) {
        throw new ObjectNotFoundError();
      }
      return blob;
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        throw new ObjectNotFoundError();
      }
      throw error;
    }
  }

  private getBlobPath(objectPath: string): string {
    const match = /^\/objects\/uploads\/([A-Za-z0-9-]+)$/.exec(objectPath);
    if (!match) {
      throw new ObjectNotFoundError();
    }

    const id = match[1];
    return `uploads/${id}`;
  }

  private sign(value: string): string {
    const secret = process.env.UPLOAD_TOKEN_SECRET;
    if (!secret) {
      throw new Error("UPLOAD_TOKEN_SECRET is not configured.");
    }
    return createHmac("sha256", secret).update(value).digest("base64url");
  }
}

export function isSupportedImageType(contentType: string): boolean {
  return allowedImageTypes.has(contentType);
}

export const maxUploadedImageSize = maxImageSize;
