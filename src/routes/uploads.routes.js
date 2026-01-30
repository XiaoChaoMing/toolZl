import { Router } from "express";
import { downloadResultFile } from "../controllers/uploads.controller.js";

const router = Router();

router.get("/uploads/:filename", downloadResultFile);

export default router;

