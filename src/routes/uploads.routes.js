import { Router } from "express";
import { downloadResultFile } from "../controllers/uploads.controller.js";
import { workspaceMiddleware } from "../middleware/workspace.middleware.js";

const router = Router();

router.get("/uploads/:filename", workspaceMiddleware, downloadResultFile);

export default router;

