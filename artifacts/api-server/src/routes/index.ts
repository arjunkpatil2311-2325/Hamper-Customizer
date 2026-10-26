import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import productsRouter from "./products";
import adminProductsRouter from "./adminProducts";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(adminProductsRouter);
router.use(ordersRouter);
router.use(storageRouter);

export default router;
