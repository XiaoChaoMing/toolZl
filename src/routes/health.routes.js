import { Router } from "express";
import { getApiInfo, getHealth } from "../controllers/health.controller.js";

const router = Router();

router.get("/api", getApiInfo);
router.get("/health", getHealth);

export default router;

