import { ListProductsResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { products } from "../data/products";

const router: IRouter = Router();

router.get("/products", (_req, res) => {
  res.json(ListProductsResponse.parse(products));
});

export default router;
