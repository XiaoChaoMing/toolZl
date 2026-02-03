import { Router } from "express";
import { uploadExcelMiddleware } from "../middleware/upload.middleware.js";
import { workspaceMiddleware } from "../middleware/workspace.middleware.js";
import { processExcel } from "../controllers/excel.controller.js";
import { getActiveExcelJob } from "../services/job.service.js";

const router = Router();

function blockIfExcelSessionActive(req, res, next) {
  const active = getActiveExcelJob(req.workspaceId);
  if (active) {
    return res.status(400).json({
      success: false,
      message:
        "Đang có phiên xử lý Excel khác (running/paused). Vui lòng hoàn thành hoặc dừng phiên hiện tại trước khi tải file mới.",
      activeJobId: active.id,
      status: active.status,
      downloadUrl: active.downloadUrl || null,
    });
  }
  return next();
}

router.post(
  "/api/process-excel",
  workspaceMiddleware,
  blockIfExcelSessionActive,
  uploadExcelMiddleware,
  processExcel
);

export default router;

