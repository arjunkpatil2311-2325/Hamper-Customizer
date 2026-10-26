import type { Request, Response } from "express";
import app from "./app";

export default function vercelHandler(req: Request, res: Response): void {
  if (req.url?.startsWith("/api/")) {
    req.url = req.url.slice("/api".length);
  }
  app(req, res);
}
