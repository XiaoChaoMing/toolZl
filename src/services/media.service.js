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

export function countValidPhonesInMediaExcel({ filePath }) {
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

async function waitForResume(jobId) {
    while (true) {
        const job = getJob(jobId);
        if (!job || job.status === "cancelled") {
            return false;
        }

        if (job.status === "paused" && shouldAutoResume(jobId)) {
            updateJob(jobId, {
                status: 'running',
                pausedUntil: null,
                pauseReason: null,
                warning: null
            });
            return true;
        }

        if (job.status === "running") {
            return true;
        }
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
    for (let r = range.e.r; r > 0; r--) {
        const resultCell = XLSX.utils.encode_cell({ r, c: resultCol });
        const resultValue = sheet[resultCell]?.v;

        if (resultValue !== undefined && resultValue !== null && resultValue !== "") {
            return r;
        }
    }
    return -1;
}

// Build attachments from media files with Buffer format
function buildAttachments(mediaFiles) {
    const attachments = [];

    for (const file of mediaFiles) {
        try {
            const filePath = path.resolve(file.path);
            if (!fs.existsSync(filePath)) {
                console.log(`Media file not found: ${filePath}`);
                continue;
            }

            const buffer = fs.readFileSync(filePath);
            const isImage = file.mimetype.startsWith('image/');

            let width = 1920, height = 1080;
            if (isImage) {
                try {
                    const dimensions = sizeOf(buffer);
                    width = dimensions.width || 1920;
                    height = dimensions.height || 1080;
                } catch (e) {
                    // Use default dimensions
                }
            }

            attachments.push({
                data: buffer,
                filename: file.originalname || file.filename,
                metadata: {
                    totalSize: buffer.length,
                    width,
                    height,
                }
            });
        } catch (err) {
            console.error(`Error reading media file: ${file.path}`, err);
        }
    }

    return attachments;
}

export async function processMediaExcelFile({
    filePath,
    timeout,
    zaloApi,
    ThreadType,
    onProgress,
    jobId,
    outputFileName,
    outputFilePath,
    mediaFiles, // Array of uploaded media file objects
}) {
    ensureDir(UPLOAD_DIR);

    try {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const range = XLSX.utils.decode_range(sheet["!ref"]);

        // Build attachments once (same media for all users)
        const attachments = buildAttachments(mediaFiles);
        console.log(`Built ${attachments.length} attachments for bulk sending`);

        if (attachments.length === 0) {
            throw new Error("Không có media files hợp lệ để gửi");
        }

        // Count invalid phones
        let invalidPhoneCount = 0;
        for (let r = 0; r <= range.e.r; r++) {
            const phoneCell = XLSX.utils.encode_cell({ r, c: 1 });
            const raw = sheet[phoneCell]?.v ?? "";
            if (raw && !isVietnamesePhoneNumberValid(raw)) {
                invalidPhoneCount++;
            }
        }

        const totalValidPhones = (range.e.r + 1) - invalidPhoneCount;

        if (jobId) {
            startJob(jobId, totalValidPhones, invalidPhoneCount);
        }

        const stats = {
            total: 0,
            invalid: 0,
            found: 0,
            notFound: 0,
            error: 0,
            sendMessageSuccess: 0,
            sendMessageFailed: 0,
        };

        const resultCol = 2;
        const userNameCol = 3;
        const userIdCol = 4;
        const userPhoneCol = 5;
        const userAvatarCol = 6;
        const sendMessageResultCol = 7;
        const mediaCountCol = 8;

        const queue = new PQueue({
            concurrency: ZALO_QUEUE_CONCURRENCY,
            intervalCap: ZALO_QUEUE_INTERVAL_CAP,
            interval: ZALO_QUEUE_INTERVAL,
            autoStart: true,
        });

        const lastProcessedRow = findLastProcessedRow(sheet, range, resultCol);
        const startRow = lastProcessedRow >= 0 ? lastProcessedRow + 1 : 0;

        let processedValidPhones = 0;
        if (lastProcessedRow >= 0) {
            for (let r = 0; r <= lastProcessedRow; r++) {
                const phoneCell = XLSX.utils.encode_cell({ r, c: 1 });
                const raw = sheet[phoneCell]?.v ?? "";
                if (raw && isVietnamesePhoneNumberValid(raw)) {
                    processedValidPhones++;
                }
            }

            logInfo("media_excel_resume_detected", {
                lastProcessedRow,
                startRow,
                processedValidPhones,
                totalRows: range.e.r + 1,
            });
        }

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
            const mediaCountCell = XLSX.utils.encode_cell({ r, c: mediaCountCol });

            if (!isVietnamesePhoneNumberValid(raw)) {
                stats.invalid++;
                sheet[resultCell] = { t: "s", v: "Định dạng sđt không đúng" };
                continue;
            }

            const phone = normalizeVietnamesePhoneNumber(raw);

            // Check job status
            if (jobId) {
                const job = getJob(jobId);
                if (!job) break;
                if (job.status === "cancelled") break;
                if (job.status === "paused") {
                    const resumed = await waitForResume(jobId);
                    if (!resumed) break;
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
                        sheet[sendResultCell] = { t: "s", v: "gửi media thất bại" };
                        sheet[mediaCountCell] = { t: "n", v: 0 };
                        return;
                    }

                    // Random message
                    const message = randomItem(MESSAGE_TEMPLATES);

                    try {
                        const result = await pTimeout(
                            zaloApi.sendMessage(
                                { msg: message, attachments },
                                uid.toString(),
                                ThreadType.User
                            ),
                            { milliseconds: timeout, message: "Timeout" }
                        );

                        const sentCount = result?.attachment?.length || attachments.length;
                        stats.sendMessageSuccess++;
                        sheet[sendResultCell] = { t: "s", v: "gửi media thành công" };
                        sheet[mediaCountCell] = { t: "n", v: sentCount };

                        logSuccess(phone, {
                            name: userName,
                            avatar: userAvatar,
                            message,
                            mediaCount: sentCount,
                            processingTime: `${timeout}ms`,
                        });
                    } catch (err) {
                        stats.sendMessageFailed++;
                        const errorMsg = (err?.message || String(err))
                            .replace(/\r?\n/g, " ")
                            .trim();
                        sheet[sendResultCell] = { t: "s", v: errorMsg };
                        sheet[mediaCountCell] = { t: "n", v: 0 };

                        logSendMessageFailed(phone, err?.message || String(err), {
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

                    // Auto-pause on rate limit
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

            // Batch write
            batchCount++;
            if (batchCount >= BATCH_SIZE && jobId) {
                const job = getJob(jobId);
                if (job && (job.status === "running" || job.status === "paused")) {
                    sheet["!ref"] = XLSX.utils.encode_range({
                        s: range.s,
                        e: { r: range.e.r, c: Math.max(range.e.c, mediaCountCol) },
                    });
                    XLSX.writeFile(workbook, outputFilePath);
                    batchCount = 0;
                }
            }
        }

        await queue.onIdle();

        // Final check
        if (jobId) {
            const job = getJob(jobId);
            if (!job || job.status === "cancelled") {
                sheet["!ref"] = XLSX.utils.encode_range({
                    s: range.s,
                    e: { r: range.e.r, c: Math.max(range.e.c, mediaCountCol) },
                });
                XLSX.writeFile(workbook, outputFilePath);
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
        sheet["!ref"] = XLSX.utils.encode_range({
            s: range.s,
            e: { r: range.e.r, c: Math.max(range.e.c, mediaCountCol) },
        });
        XLSX.writeFile(workbook, outputFilePath);

        safeUnlink(filePath);

        if (jobId) {
            endJob();
        }

        logInfo("media_excel_job_completed", {
            outputFileName,
            stats,
            mediaCount: attachments.length,
        });

        return { stats, outputFileName };
    } catch (error) {
        safeUnlink(filePath);
        if (jobId) {
            endJob();
        }
        logError("media_excel_job_failed", {
            error: error?.message || String(error),
        });
        throw error;
    }
}
