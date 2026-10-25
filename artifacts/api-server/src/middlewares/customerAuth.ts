import { clerkClient, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { errorPayload } from "../lib/httpErrors";

export function getCustomerId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

export const requireCustomer: RequestHandler = (req, res, next) => {
  if (!getCustomerId(req)) {
    res.status(401).json(errorPayload("Sign in required"));
    return;
  }

  next();
};

export async function isStudioAdmin(req: Request): Promise<boolean> {
  const adminEmail = process.env.HAMPER_HUB_ADMIN_EMAIL?.trim().toLowerCase();
  const userId = getCustomerId(req);
  if (!adminEmail || !userId) return false;

  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.some(
    (address) =>
      address.emailAddress.toLowerCase() === adminEmail &&
      address.verification?.status === "verified",
  );
}

export const requireStudioAdmin: RequestHandler = async (req, res, next) => {
  if (!getCustomerId(req)) {
    res.status(401).json(errorPayload("Sign in required"));
    return;
  }

  if (!process.env.HAMPER_HUB_ADMIN_EMAIL?.trim()) {
    req.log.error("Hamper Hub studio admin email is not configured");
    res.status(503).json(errorPayload("Studio access is not configured"));
    return;
  }

  try {
    if (await isStudioAdmin(req)) {
      next();
      return;
    }
    res.status(403).json(errorPayload("Studio admin access required"));
  } catch (error) {
    req.log.error({ err: error }, "Unable to verify studio admin");
    res.status(503).json(errorPayload("Studio access is temporarily unavailable"));
  }
};
