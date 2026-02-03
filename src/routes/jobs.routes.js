import { Router } from "express";
import {
  listExcelJobsHandler,
  getJobStatus,
  pauseJob,
  resumeJob,
  cancelJob,
  setRetryDelay,
} from "../controllers/jobs.controller.js";
import { workspaceMiddleware } from "../middleware/workspace.middleware.js";

const router = Router();

// List all excel jobs (history)
router.get("/api/jobs", workspaceMiddleware, listExcelJobsHandler);
router.get("/api/jobs/:id", workspaceMiddleware, getJobStatus);
router.post("/api/jobs/:id/pause", workspaceMiddleware, pauseJob);
router.post("/api/jobs/:id/resume", workspaceMiddleware, resumeJob);
router.post("/api/jobs/:id/cancel", workspaceMiddleware, cancelJob);
router.post("/api/jobs/:id/set-retry-delay", workspaceMiddleware, setRetryDelay);

export default router;
