import {
  DEFAULT_MESSAGE_TIMEOUT_MS,
} from "../config/constants.js";
import {
  getZaloApi,
  getZaloStatus,
  ThreadType,
} from "../services/zalo.service.js";
import { createJob, getActiveExcelJob, updateJob } from "../services/job.service.js";
import { analyzeExcelForResume, processExcelFile } from "../services/excel.service.js";
import { logInfo, logError } from "../utils/logger.js";

export async function processExcel(req, res) {
  const excelFile = req.files?.file?.[0];

  if (!excelFile) {
    return res.status(400).json({
      success: false,
      message: "Không có file được tải lên",
    });
  }

  const zaloStatus = getZaloStatus(req.workspaceId);
  const zaloApi = getZaloApi(req.workspaceId);

  if (!zaloStatus.initialized || !zaloApi) {
    return res.status(400).json({
      success: false,
      message: "Zalo service chưa khởi tạo. Vui lòng quét QR code trước.",
    });
  }

  // Business rule: only one active Excel session at a time
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

  // Timeout cố định 2 phút cho mỗi lần gửi tin nhắn
  const timeout = DEFAULT_MESSAGE_TIMEOUT_MS;

  // NEW: Parse retry delay for rate limit handling
  let retryDelay = parseInt(req.body.retryDelay, 10);
  if (Number.isNaN(retryDelay) || retryDelay < 60000 || retryDelay > 3600000) {
    retryDelay = 20 * 60 * 1000; // Default 20 minutes
  }

  // NEW: Parse task delay interval
  let taskDelay = parseInt(req.body.taskDelay, 10);
  // Allow 0..600s (0..600000ms). NaN falls back to default 3s.
  if (Number.isNaN(taskDelay)) {
    taskDelay = 3000; // Default 3 seconds
  } else {
    taskDelay = Math.max(0, Math.min(600000, taskDelay));
  }

  // NEW: Parse custom messages separated by |
  let customMessages = [];
  if (req.body.message && req.body.message.trim()) {
    customMessages = req.body.message
      .split('|')
      .map(msg => msg.trim())
      .filter(msg => msg.length > 0);
  }
  // If empty, will fallback to MESSAGE_TEMPLATES in service

  // NEW: Parse auto friend request
  const autoFriendRequest = req.body.autoFriendRequest === 'true' || req.body.autoFriendRequest === true;
  const friendRequestMessage = req.body.friendRequestMessage || "Xin chào! Tôi muốn kết bạn với bạn.";

  const filePath = excelFile.path;
  const mediaFiles = req.files?.media || [];

  // Prepare job (Analyze file for resume)
  let analysis;
  try {
    analysis = analyzeExcelForResume({ filePath });

    logInfo("excel_file_analyzed", {
      totalPhones: analysis.totalValidPhones,
      processed: analysis.processedValidCount,
      invalid: analysis.invalidPhoneCount,
      startRow: analysis.startRow
    });
  } catch (error) {
    logError("excel_file_analyze_error", {
      error: error?.message || String(error),
    });
    return res.status(500).json({
      success: false,
      message: `Lỗi đọc file: ${error.message}`,
    });
  }

  const job = createJob(req.workspaceId, {
    status: "pending",
    totalPhones: analysis.totalValidPhones,
    processed: analysis.processedValidCount,
    currentIndex: analysis.processedValidCount,
    currentPhone: null,
    downloadUrl: null,
    retryDelay, // NEW: Pass retry delay for rate limit handling
    stats: analysis.stats,
  });

  // Per-job output file (unique)
  const outputFileName = `data_zalo_result_${job.id}.xlsx`;
  const { resolveWorkspaceUploadPath } = await import("../utils/file.js");
  const outputFilePath = resolveWorkspaceUploadPath(req.workspaceId, outputFileName);
  updateJob(job.id, { downloadUrl: `/uploads/${encodeURIComponent(outputFileName)}` });

  // Start background processing
  updateJob(job.id, { status: "running" });
  logInfo("excel_job_started", {
    jobId: job.id,
    totalPhones: analysis.totalValidPhones,
    invalid: analysis.invalidPhoneCount,
    timeout,
    taskDelay, // ms
    taskDelaySeconds: Math.floor(taskDelay / 1000),
    outputFileName,
  });
  processExcelFile({
    filePath,
    timeout,
    taskDelay, // NEW: Pass task delay
    customMessages, // NEW: Custom messages array from UI
    autoFriendRequest, // NEW: Auto friend request flag
    friendRequestMessage, // NEW: Friend request message
    zaloApi,
    ThreadType,
    jobId: job.id,
    outputFileName,
    outputFilePath,
    mediaFiles,
    onProgress: ({ processed, currentIndex, currentPhone, stats }) => {
      updateJob(job.id, {
        processed,
        currentIndex,
        currentPhone,
        stats,
      });
    },
  })
    .then(({ stats, outputFileName }) => {
      updateJob(job.id, {
        status: "completed",
        stats,
        currentPhone: null,
        downloadUrl: `/uploads/${outputFileName}`,
      });
      logInfo("excel_job_finished", {
        jobId: job.id,
        outputFileName,
        stats,
      });
    })
    .catch((error) => {
      updateJob(job.id, {
        status: "failed",
        error: error?.message || String(error),
      });
      logError("excel_job_failed_async", {
        jobId: job.id,
        error: error?.message || String(error),
      });
    });

  return res.json({
    success: true,
    message: "Job started",
    jobId: job.id,
    totalPhones: analysis.totalValidPhones,
  });
}

