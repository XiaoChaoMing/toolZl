import XLSX from "xlsx";
import PQueue from "p-queue";
import pTimeout from "p-timeout";
import fs from "fs";
import path from "path";
import sizeOf from "image-size";
import { randomItem } from "../utils/random.js";
import {
  isVietnamesePhoneNumberValid,
  normalizeVietnamesePhoneNumber,
} from "../utils/phone.js";
import {
  MESSAGE_TEMPLATES,
  UPLOAD_DIR,
} from "../config/constants.js";
import { ensureDir, safeUnlink, resolveUploadPath } from "../utils/file.js";
import {
  ZALO_QUEUE_CONCURRENCY,
  ZALO_QUEUE_INTERVAL_CAP,
  ZALO_QUEUE_INTERVAL,
} from "../config/queue.js";
import {
  logInfo,
  logError,
  startJob,
  endJob,
  logSuccess,
  logFindUserFailed,
  logSendMessageFailed,
} from "../utils/logger.js";
import { getJob, updateJob, autoPauseJob, shouldAutoResume } from "./job.service.js";

export function countValidPhonesInExcel({ filePath }) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  let totalPhones = 0;
  let invalid = 0;

  for (let r = 0; r <= range.e.r; r++) {
    const phoneCell = XLSX.utils.encode_cell({ r, c: 1 });
    const raw = sheet[phoneCell]?.v ?? "";

    if (!raw) continue;

    if (!isVietnamesePhoneNumberValid(raw)) {
      invalid++;
      continue;
    }

    totalPhones++;
  }

  return { totalPhones, invalid };
}

async function waitForResume(jobId, saveCallback) {
  let hasCalledSaveCallback = false;
  
  while (true) {
    const job = getJob(jobId);
    if (!job || job.status === "cancelled") {
      return false; // cancelled
    }

    // Auto-resume check: if paused and timeout has passed
    if (job.status === "paused" && shouldAutoResume(jobId)) {
      updateJob(jobId, {
        status: 'running',
        pausedUntil: null,
        pauseReason: null,
        warning: null  // Clear warning
      });
      return true;
    }

    if (job.status === "running") {
      return true; // resumed
    }
    
    // paused - save file before waiting (only once)
    if (job.status === "paused" && !hasCalledSaveCallback && typeof saveCallback === "function") {
      try {
        saveCallback();
        hasCalledSaveCallback = true;
      } catch (error) {
        logError("save_callback_error", {
          jobId,
          error: error?.message || String(error),
        });
      }
    }
    
    // paused - wait
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function shouldAutoPauseOnError(error) {
  const msg = (error?.message || String(error)).toLowerCase();
  return (
    msg.includes("tìm số điện thoại quá nhiều lần") ||
    msg.includes("quá nhiều lần trong 1 giờ") ||
    msg.includes("hoạt động bất thường") ||
    msg.includes("vượt quá số request cho phép") ||
    msg.includes("vượt quá số request") ||
    msg.includes("request cho phép")
  );
}

function findLastProcessedRow(sheet, range, resultCol) {
  // Duyệt từ dòng cuối cùng lên đầu (bỏ qua dòng header r=0)
  for (let r = range.e.r; r > 0; r--) {
    const resultCell = XLSX.utils.encode_cell({ r, c: resultCol });
    const resultValue = sheet[resultCell]?.v;

    // Nếu có giá trị ở cột kết quả (không rỗng), dòng này đã được xử lý
    if (resultValue !== undefined && resultValue !== null && resultValue !== "") {
      return r;
    }
  }

  // Không tìm thấy dòng nào đã xử lý
  return -1;
}

export function analyzeExcelForResume({ filePath }) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  const stats = {
    total: 0,
    invalid: 0,
    found: 0,
    notFound: 0,
    error: 0,
    sendMessageSuccess: 0,
    sendMessageFailed: 0,
  };

  let processedValidCount = 0;
  let firstUnprocessedRow = -1;

  for (let r = 0; r <= range.e.r; r++) {
    const phoneCell = XLSX.utils.encode_cell({ r, c: 1 });
    const raw = sheet[phoneCell]?.v ?? "";
    if (!raw) continue;

    const isValid = isVietnamesePhoneNumberValid(raw);
    if (!isValid) {
      stats.invalid++;
      continue;
    }

    // Check results columns
    const resultCell = XLSX.utils.encode_cell({ r, c: 2 });
    const sendResultCell = XLSX.utils.encode_cell({ r, c: 7 });

    const result = sheet[resultCell]?.v;
    const sendResult = sheet[sendResultCell]?.v;

    let isDone = false;
    if (result === "Không tìm thấy") {
      stats.notFound++;
      isDone = true;
    } else if (result === "Tìm thấy") {
      if (sendResult) {
        stats.found++;
        isDone = true;
        if (sendResult.includes("thành công")) {
          stats.sendMessageSuccess++;
        } else {
          stats.sendMessageFailed++;
        }
      }
    }

    if (isDone) {
      stats.total++; // Only count towards processed total if done
      processedValidCount++;
    } else if (firstUnprocessedRow === -1) {
      firstUnprocessedRow = r;
    }
  }

  // Count ALL valid phones in the file for target total
  let totalValidPhones = 0;
  for (let r = 0; r <= range.e.r; r++) {
    const phoneCell = XLSX.utils.encode_cell({ r, c: 1 });
    const raw = sheet[phoneCell]?.v ?? "";
    if (raw && isVietnamesePhoneNumberValid(raw)) {
      totalValidPhones++;
    }
  }

  return {
    stats,
    processedValidCount,
    startRow: firstUnprocessedRow === -1 ? (range.e.r + 1) : firstUnprocessedRow,
    totalValidPhones,
    invalidPhoneCount: stats.invalid
  };
}

function buildAttachments(mediaFiles) {
  const attachments = [];

  for (const file of mediaFiles || []) {
    try {
      const filePath = path.resolve(file.path);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const buffer = fs.readFileSync(filePath);
      const isImage = (file.mimetype || "").startsWith("image/");

      let width = 1920;
      let height = 1080;
      if (isImage) {
        try {
          const dimensions = sizeOf(buffer);
          width = dimensions.width || 1920;
          height = dimensions.height || 1080;
        } catch {
        }
      }

      attachments.push({
        data: buffer,
        filename: file.originalname || file.filename,
        metadata: {
          totalSize: buffer.length,
          width,
          height,
        },
      });
    } catch {
    }
  }

  return attachments;
}

/**
 * Helper function to save workbook to file
 * @param {Object} workbook - XLSX workbook object
 * @param {string} outputFilePath - Path to save the file
 * @param {Object} range - Range object with s and e properties
 * @param {boolean} hasMedia - Whether media attachments are included
 * @param {number} mediaCountCol - Column index for media count
 * @param {number} sendMessageResultCol - Column index for send message result
 */
function saveWorkbook(workbook, outputFilePath, range, hasMedia, mediaCountCol, sendMessageResultCol) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  sheet["!ref"] = XLSX.utils.encode_range({
    s: range.s,
    e: { r: range.e.r, c: Math.max(range.e.c, hasMedia ? mediaCountCol : sendMessageResultCol) },
  });
  XLSX.writeFile(workbook, outputFilePath);
}

export async function processExcelFile({
  filePath,
  timeout,
  taskDelay, // NEW: Dynamic task delay from UI
  customMessages, // NEW: Custom messages array from UI
  zaloApi,
  ThreadType,
  onProgress,
  jobId,
  outputFileName,
  outputFilePath,
  mediaFiles = [],
}) {
  ensureDir(UPLOAD_DIR);

  try {
    // Initialize logging for this job
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = XLSX.utils.decode_range(sheet["!ref"]);

    // NEW: Analyze file for resume stats and startRow
    const analysis = analyzeExcelForResume({ filePath });
    const totalValidPhones = analysis.totalValidPhones;
    const invalidPhoneCount = analysis.invalidPhoneCount;
    const startRow = analysis.startRow;
    const stats = analysis.stats;
    let processedValidPhones = analysis.processedValidCount;

    if (jobId) {
      startJob(jobId, totalValidPhones, invalidPhoneCount);
      logInfo("excel_job_resuming", {
        jobId,
        startRow,
        processedValidPhones,
        stats
      });
    }

    const resultCol = 2;
    const userNameCol = 3;
    const userIdCol = 4;
    const userPhoneCol = 5;
    const userAvatarCol = 6;
    const sendMessageResultCol = 7;
    const mediaCountCol = 8;

    const attachments = buildAttachments(mediaFiles);
    const hasMedia = attachments.length > 0;

    // Create save callback function for pause/resume handling
    const saveCallback = () => {
      saveWorkbook(workbook, outputFilePath, range, hasMedia, mediaCountCol, sendMessageResultCol);
    };

    // Create output file early to ensure it exists from the start
    // This allows users to download the file even before processing starts
    saveCallback();
    logInfo("excel_file_created_early", {
      jobId,
      outputFileName,
      outputFilePath,
    });

    // Determine queue config based on taskDelay
    const useBatchMode = !taskDelay || taskDelay === 0;

    const queue = new PQueue({
      concurrency: useBatchMode ? ZALO_QUEUE_CONCURRENCY : 1,
      intervalCap: useBatchMode ? ZALO_QUEUE_INTERVAL_CAP : 1,
      interval: useBatchMode ? ZALO_QUEUE_INTERVAL : taskDelay,
      autoStart: true,
    });

    logInfo("queue_config", {
      mode: useBatchMode ? "batch" : "sequential",
      concurrency: useBatchMode ? ZALO_QUEUE_CONCURRENCY : 1,
      intervalCap: useBatchMode ? ZALO_QUEUE_INTERVAL_CAP : 1,
      interval: useBatchMode ? ZALO_QUEUE_INTERVAL : taskDelay,
      taskDelaySeconds: taskDelay / 1000,
    });

    let batchCount = 0;
    const BATCH_SIZE = 5;

    for (let r = startRow; r <= range.e.r; r++) {
      stats.total++;

      const phoneCell = XLSX.utils.encode_cell({ r, c: 1 });
      const raw = sheet[phoneCell]?.v ?? "";

      const resultCell = XLSX.utils.encode_cell({ r, c: resultCol });
      const userNameCell = XLSX.utils.encode_cell({ r, c: userNameCol });
      const userIdCell = XLSX.utils.encode_cell({ r, c: userIdCol });
      const userPhoneCell = XLSX.utils.encode_cell({ r, c: userPhoneCol });
      const userAvatarCell = XLSX.utils.encode_cell({ r, c: userAvatarCol });
      const sendResultCell = XLSX.utils.encode_cell({ r, c: sendMessageResultCol });

      if (!isVietnamesePhoneNumberValid(raw)) {
        stats.invalid++;
        sheet[resultCell] = { t: "s", v: "Định dạng sđt không đúng" };
        continue;
      }

      const phone = normalizeVietnamesePhoneNumber(raw);

      // Check job status before processing
      if (jobId) {
        const job = getJob(jobId);
        if (!job) {
          break; // job deleted
        }
        if (job.status === "cancelled") {
          break;
        }
        if (job.status === "paused") {
          const resumed = await waitForResume(jobId, saveCallback);
          if (!resumed) {
            break; // cancelled while paused
          }
        }
      }

      processedValidPhones++;

      if (typeof onProgress === "function") {
        onProgress({
          processed: processedValidPhones,
          currentIndex: processedValidPhones,
          currentPhone: phone,
          stats,
        });
      }

      await queue.add(async () => {
        try {
          const user = await zaloApi.findUser(phone);
          if (!user) {
            stats.notFound++;
            sheet[resultCell] = { t: "s", v: "Không tìm thấy" };
            return;
          }

          stats.found++;

          const userName = user.name || user.displayName || user.zalo_name || "N/A";
          const uid = user.uid || user.globalId || user.userId || "N/A";
          const userPhone = user.phone || raw || "N/A";
          const userAvatar = user.avatar || user.avatarUrl || "N/A";

          sheet[resultCell] = { t: "s", v: "Tìm thấy" };
          sheet[userNameCell] = { t: "s", v: userName };
          sheet[userIdCell] = { t: "s", v: String(uid) };
          sheet[userPhoneCell] = { t: "s", v: String(userPhone) };
          sheet[userAvatarCell] = { t: "s", v: userAvatar };

          if (!uid || uid === "N/A") {
            stats.sendMessageFailed++;
            sheet[sendResultCell] = { t: "s", v: hasMedia ? "gửi media thất bại" : "gửi tn thất bại" };
            if (hasMedia) {
              const mediaCountCell = XLSX.utils.encode_cell({ r, c: mediaCountCol });
              sheet[mediaCountCell] = { t: "n", v: 0 };
            }
            return;
          }
          // Use customMessages if available, otherwise fallback to MESSAGE_TEMPLATES
          const message = (customMessages && customMessages.length > 0)
            ? randomItem(customMessages)
            : randomItem(MESSAGE_TEMPLATES);

          try {
            if (hasMedia) {
              const result = await pTimeout(
                zaloApi.sendMessage(
                  { msg: message, attachments },
                  uid.toString(),
                  ThreadType.User
                ),
                { milliseconds: timeout, message: "Timeout" }
              );
              const sentCount = result?.attachment?.length || attachments.length;
              sheet[mediaCountCol] = { t: "n", v: sentCount };
              sheet[sendResultCell] = { t: "s", v: "gửi media thành công" };
            } else {
              await pTimeout(
                zaloApi.sendMessage(message, uid.toString(), ThreadType.User),
                { milliseconds: timeout, message: "Timeout" }
              );
              sheet[sendResultCell] = { t: "s", v: "gửi tn thành công" };
            }

            stats.sendMessageSuccess++;
            logSuccess(phone, {
              name: userName,
              avatar: userAvatar,
              message,
              mediaCount: hasMedia ? (attachments?.length || 0) : 0,
              processingTime: `${timeout}ms`,
            });
          } catch (err) {
            stats.sendMessageFailed++;
            const isTimeout = (err?.message || "").toLowerCase().includes("timeout");
            const rawMsg = (err?.message || String(err))
              .replace(/\r?\n/g, " ")
              .trim();
            const errorMsg = isTimeout ? `Timeout sau ${Math.floor(timeout / 1000)}s` : rawMsg;
            sheet[sendResultCell] = { t: "s", v: errorMsg };

            logSendMessageFailed(phone, rawMsg, {
              uid,
              name: userName,
              avatar: userAvatar,
              message
            });
          }
        } catch (err) {
          stats.error++;
          const errorMsg = (err?.message || String(err))
            .replace(/\r?\n/g, " ")
            .trim();
          sheet[resultCell] = { t: "s", v: errorMsg };

          logFindUserFailed(phone, err?.message || String(err));

          // Auto-pause on rate limit error
          if (shouldAutoPauseOnError(err) && jobId) {
            const job = getJob(jobId);
            if (job && job.status === 'running') {
              const delayMs = job.retryDelay || (20 * 60 * 1000);
              const delayMinutes = Math.floor(delayMs / 60000);

              autoPauseJob(jobId, 'rate_limit', delayMs);
              updateJob(jobId, {
                warning: `⏸️ Tạm dừng do rate limit. Sẽ tự động tiếp tục sau ${delayMinutes} phút.`
              });
            }
          }
        }
      });

      // Batch write every BATCH_SIZE valid phones
      batchCount++;
      if (batchCount >= BATCH_SIZE && jobId) {
        const job = getJob(jobId);
        if (job && (job.status === "running" || job.status === "paused")) {
          saveCallback();
          batchCount = 0;
        }
      }
    }

    await queue.onIdle();

    // Final check for cancelled
    if (jobId) {
      const job = getJob(jobId);
      if (!job || job.status === "cancelled") {
        // Flush file before exiting
        saveCallback();
        throw new Error("Job cancelled");
      }
    }

    if (typeof onProgress === "function") {
      onProgress({
        processed: processedValidPhones,
        currentIndex: processedValidPhones,
        currentPhone: null,
        stats,
      });
    }

    // Final write
    saveCallback();

    safeUnlink(filePath);

    if (jobId) {
      endJob();
    }

    logInfo("excel_job_completed", {
      outputFileName,
      stats,
    });

    return { stats, outputFileName };
  } catch (error) {
    safeUnlink(filePath);
    if (jobId) {
      endJob();
    }
    logError("excel_job_failed", {
      error: error?.message || String(error),
    });
    throw error;
  }
}

