import type { Request, Response } from "express";
import app from "./app.js";

type VercelRequest = Request & { url?: string };

export default function vercelHandler(req: VercelRequest, res: Response): void {
  if (req.url?.startsWith("/api/")) {
    req.url = req.url.slice("/api".length);
  }
  app(req, res);
}
