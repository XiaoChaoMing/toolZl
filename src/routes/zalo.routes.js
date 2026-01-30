import { Router } from "express";
import {
  getZaloStatusHandler,
  getQrCode,
  regenerateQrHandler,
} from "../controllers/zalo.controller.js";

const router = Router();

router.get("/zalo/status", getZaloStatusHandler);
router.get("/qr", getQrCode);
router.get("/qr/:filename", getQrCode); // Support filename in route
router.post("/zalo/qr/regenerate", regenerateQrHandler);

export default router;

