import { getAuth } from "@clerk/express";
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
