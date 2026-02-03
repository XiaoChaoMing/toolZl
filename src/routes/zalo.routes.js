import { Router } from "express";
import { workspaceMiddleware } from "../middleware/workspace.middleware.js";
import {
  getZaloStatusHandler,
  getQrCode,
  regenerateQrHandler,
} from "../controllers/zalo.controller.js";

const router = Router();

router.get("/zalo/status", workspaceMiddleware, getZaloStatusHandler);
router.get("/qr", workspaceMiddleware, getQrCode);
router.get("/qr/:filename", workspaceMiddleware, getQrCode); // Support filename in route
router.post("/zalo/qr/regenerate", workspaceMiddleware, regenerateQrHandler);

export default router;

