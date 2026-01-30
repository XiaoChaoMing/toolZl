import { Router } from "express";
import healthRoutes from "./health.routes.js";
import zaloRoutes from "./zalo.routes.js";
import uploadsRoutes from "./uploads.routes.js";
import excelRoutes from "./excel.routes.js";
import jobsRoutes from "./jobs.routes.js";

const router = Router();

router.use(healthRoutes);
router.use(zaloRoutes);
router.use(uploadsRoutes);
router.use(excelRoutes);
router.use(jobsRoutes);

export default router;

