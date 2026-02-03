import fs from "fs";
import path from "path";

const LOG_DIR = "logs";
const LOG_FILE = path.join(LOG_DIR, "zalo-messages.log"); // Single shared log file

// Biến để lưu context cho job hiện tại
let currentJobContext = {
  jobId: null,
  totalPhones: 0,
  invalid: 0,
  startTime: null,
  stats: {
    success: 0,
    failed: 0,
    userInvalid: 0,
    notFound: 0,
    blocked: 0,
    cannotReceive: 0,
    rateLimit: 0
  }
};

let phoneCounter = 0;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// Chuyển đổi UTC sang GMT+7 (Vietnam timezone)
function toVietnamTime(date = new Date()) {
  const utcDate = new Date(date);
  // Add 7 hours for Vietnam timezone
  utcDate.setHours(utcDate.getHours() + 7);

  const year = utcDate.getFullYear();
  const month = String(utcDate.getMonth() + 1).padStart(2, '0');
  const day = String(utcDate.getDate()).padStart(2, '0');
  const hours = String(utcDate.getHours()).padStart(2, '0');
  const minutes = String(utcDate.getMinutes()).padStart(2, '0');
  const seconds = String(utcDate.getSeconds()).padStart(2, '0');
  const ms = String(utcDate.getMilliseconds()).padStart(3, '0');

  return {
    full: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
    short: `${hours}:${minutes}:${seconds}.${ms}`,
  };
}

// Ghi header của file log (với session separator nếu file đã tồn tại)
function writeLogHeader(jobId, totalPhones, invalid) {
  const vnTime = toVietnamTime();

  // Thêm session separator nếu file đã tồn tại
  let separator = '';
  if (fs.existsSync(LOG_FILE)) {
    separator = '\n\n\n'; // 3 dòng trống để phân cách các phiên
  }

  const header = separator +
    `${'═'.repeat(80)}\n` +
    `📋 LOG GỬI TIN NHẮN ZALO - Job: ${jobId}\n` +
    `📅 Thời gian bắt đầu: ${vnTime.full} (GMT+7)\n` +
    `📊 Tổng số: ${totalPhones}${invalid ? ` | Không hợp lệ: ${invalid}` : ''}\n` +
    `${'═'.repeat(80)}\n\n`;

  fs.appendFileSync(LOG_FILE, header, "utf8");
}

// Ghi summary cuối file
function writeLogSummary() {
  const vnStart = toVietnamTime(currentJobContext.startTime);
  const vnEnd = toVietnamTime();

  // Tính thời gian chạy
  const startMs = new Date(currentJobContext.startTime).getTime() + (7 * 60 * 60 * 1000);
  const endMs = Date.now() + (7 * 60 * 60 * 1000);
  const diffMs = endMs - startMs;
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  const total = currentJobContext.stats.success + currentJobContext.stats.failed;
  const successRate = total > 0
    ? ((currentJobContext.stats.success / total) * 100).toFixed(2)
    : '0.00';

  const summary = `\n${'═'.repeat(80)}\n` +
    `📊 THỐNG KÊ TỔNG KẾT\n` +
    `${'═'.repeat(80)}\n` +
    `⏰ Job ID: ${currentJobContext.jobId}\n` +
    `🌍 Timezone: GMT+7 (Việt Nam)\n` +
    `📅 Bắt đầu: ${vnStart.full}\n` +
    `⏹️  Kết thúc: ${vnEnd.full}\n` +
    `⏱️  Thời gian chạy: ${minutes} phút ${seconds} giây\n` +
    `${'─'.repeat(80)}\n` +
    `📞 Tổng số điện thoại: ${currentJobContext.totalPhones}\n` +
    (currentJobContext.invalid ? `📋 Số không hợp lệ (từ file): ${currentJobContext.invalid}\n` : '') +
    `📈 Đã xử lý: ${total}\n` +
    `${'─'.repeat(80)}\n` +
    `✅ Gửi thành công: ${currentJobContext.stats.success}\n` +
    `❌ Thất bại: ${currentJobContext.stats.failed}\n`;

  let failureDetails = '';
  if (currentJobContext.stats.failed > 0) {
    if (currentJobContext.stats.userInvalid > 0)
      failureDetails += `  ├─ User không hợp lệ: ${currentJobContext.stats.userInvalid}\n`;
    if (currentJobContext.stats.notFound > 0)
      failureDetails += `  ├─ Không tìm thấy: ${currentJobContext.stats.notFound}\n`;
    if (currentJobContext.stats.blocked > 0)
      failureDetails += `  ├─ Bị chặn tin nhắn: ${currentJobContext.stats.blocked}\n`;
    if (currentJobContext.stats.cannotReceive > 0)
      failureDetails += `  ├─ Không nhận tin nhắn: ${currentJobContext.stats.cannotReceive}\n`;
    if (currentJobContext.stats.rateLimit > 0)
      failureDetails += `  └─ Vượt quá request: ${currentJobContext.stats.rateLimit}\n`;
  }

  const footer = summary + failureDetails +
    `${'─'.repeat(80)}\n` +
    `📊 Tỷ lệ thành công: ${successRate}%\n` +
    `${'═'.repeat(80)}\n`;

  fs.appendFileSync(LOG_FILE, footer, "utf8");
}

// Format entry cho từng số điện thoại
function formatPhoneEntry(data) {
  const vnTime = toVietnamTime();
  const indexStr = String(phoneCounter).padStart(3, '0');
  const totalStr = String(currentJobContext.totalPhones);

  let statusIcon = '';
  let statusText = '';
  let statusDetail = '';

  // Xác định trạng thái
  if (data.status === 'success') {
    statusIcon = '✅';
    statusText = 'ĐÃ GỬI';
    statusDetail = 'ĐÃ GỬI THÀNH CÔNG';
    currentJobContext.stats.success++;
  } else if (data.errorType === 'find_user_failed') {
    if (data.error?.includes('User không hợp lệ')) {
      statusIcon = '❌';
      statusText = 'TÌM USER THẤT BẠI';
      statusDetail = 'USER KHÔNG HỢP LỆ';
      currentJobContext.stats.userInvalid++;
    } else if (data.error?.includes('Không tìm thấy')) {
      statusIcon = '❌';
      statusText = 'TÌM USER THẤT BẠI';
      statusDetail = 'KHÔNG TÌM THẤY USER';
      currentJobContext.stats.notFound++;
    } else if (data.error?.includes('quá nhiều lần') || data.error?.includes('Vượt quá số request')) {
      statusIcon = '⚠️';
      statusText = 'GIỚI HẠN REQUEST';
      statusDetail = 'VƯỢT QUÁ SỐ REQUEST CHO PHÉP';
      currentJobContext.stats.rateLimit++;
    }
    currentJobContext.stats.failed++;
  } else if (data.errorType === 'send_message_failed') {
    statusIcon = '⚠️';
    statusText = 'TÌM NGƯỜI DÙNG THÀNH CÔNG · GỬI TIN NHẮN THẤT BẠI';
    if (data.error?.includes('chặn không nhận tin nhắn')) {
      statusDetail = 'BỊ CHẶN TIN NHẮN';
      currentJobContext.stats.blocked++;
    } else if (data.error?.includes('Không thể nhận tin nhắn')) {
      statusDetail = 'KHÔNG NHẬN TIN NHẮN';
      currentJobContext.stats.cannotReceive++;
    } else {
      statusDetail = 'LỖI KHÔNG XÁC ĐỊNH';
    }
    currentJobContext.stats.failed++;
  }

  let entry = `[${indexStr}/${totalStr}] [${vnTime.short} GMT+7] ${statusIcon} ${statusText}\n`;
  entry += `├─ 📞 Số điện thoại: ${data.phone}\n`;

  if (data.status === 'success') {
    entry += `├─ 👤 Họ tên: ${data.name || '[Chưa có dữ liệu]'}\n`;
    entry += `├─ 🖼️  Avatar: ${data.avatar || 'N/A'}\n`;
    entry += `├─ 📊 Trạng thái: ${statusDetail}\n`;
    entry += `├─ 💬 Nội dung: ${data.message || '[Chưa có dữ liệu]'}\n`;
    entry += `└─ ⏱️  Thời gian xử lý: ${data.processingTime || 'N/A'}\n`;
  } else {
    entry += `├─ 👤 Họ tên: ${data.name || '[Không xác định]'}\n`;
    if (data.uid) {
      entry += `├─ 🆔 UID: ${data.uid}\n`;
    }
    entry += `├─ 🖼️  Avatar: ${data.avatar || 'N/A'}\n`;
    entry += `├─ 📊 Trạng thái: ${statusDetail}\n`;
    entry += `├─ 💬 Nội dung: ${data.message || '[Không gửi được]'}\n`;
    entry += `└─ ⚠️  Lỗi: ${data.error}\n`;
  }

  entry += `${'─'.repeat(80)}\n\n`;
  return entry;
}

// API Functions

/**
 * Bắt đầu một job mới
 */
export function startJob(jobId, totalPhones, invalid = 0) {
  try {
    ensureLogDir();
    phoneCounter = 0;
    currentJobContext = {
      jobId,
      totalPhones,
      invalid,
      startTime: new Date(),
      stats: {
        success: 0,
        failed: 0,
        userInvalid: 0,
        notFound: 0,
        blocked: 0,
        cannotReceive: 0,
        rateLimit: 0
      }
    };
    writeLogHeader(jobId, totalPhones, invalid);
  } catch (err) {
    console.error('Error starting job log:', err);
  }
}

/**
 * Ghi log cho một số điện thoại thành công
 */
export function logSuccess(phone, options = {}) {
  try {
    ensureLogDir();
    phoneCounter++;
    const entry = formatPhoneEntry({
      phone,
      status: 'success',
      name: options.name,
      avatar: options.avatar,
      message: options.message,
      processingTime: options.processingTime
    });
    fs.appendFileSync(LOG_FILE, entry, "utf8");
  } catch (err) {
    console.error('Error logging success:', err);
  }
}

/**
 * Ghi log cho lỗi find_user
 */
export function logFindUserFailed(phone, error) {
  try {
    ensureLogDir();
    phoneCounter++;
    const entry = formatPhoneEntry({
      phone,
      errorType: 'find_user_failed',
      error
    });
    fs.appendFileSync(LOG_FILE, entry, "utf8");
  } catch (err) {
    console.error('Error logging find user failed:', err);
  }
}

/**
 * Ghi log cho lỗi send_message
 */
export function logSendMessageFailed(phone, error, options = {}) {
  try {
    ensureLogDir();
    phoneCounter++;
    const entry = formatPhoneEntry({
      phone,
      errorType: 'send_message_failed',
      error,
      uid: options.uid,
      name: options.name,
      avatar: options.avatar,
      message: options.message
    });
    fs.appendFileSync(LOG_FILE, entry, "utf8");
  } catch (err) {
    console.error('Error logging send message failed:', err);
  }
}

/**
 * Ghi log cho friend request thành công
 */
export function logFriendRequestSuccess(phone, options = {}) {
  try {
    ensureLogDir();
    const vnTime = toVietnamTime();
    const entry = `[${vnTime.short} GMT+7] ✅ GỬI LỜI MỜI KẾT BẠN THÀNH CÔNG\n` +
      `├─ 📞 Số điện thoại: ${phone}\n` +
      `├─ 👤 Họ tên: ${options.name || '[Chưa có dữ liệu]'}\n` +
      `├─ 🆔 UID: ${options.uid || 'N/A'}\n` +
      `├─ 💬 Lời nhắn: ${options.message || '[Chưa có dữ liệu]'}\n` +
      `└─ 🖼️  Avatar: ${options.avatar || 'N/A'}\n` +
      `${'─'.repeat(80)}\n\n`;
    fs.appendFileSync(LOG_FILE, entry, "utf8");
  } catch (err) {
    console.error('Error logging friend request success:', err);
  }
}

/**
 * Ghi log cho lỗi friend request
 */
export function logFriendRequestFailed(phone, error, options = {}) {
  try {
    ensureLogDir();
    const vnTime = toVietnamTime();
    const errorMsg = error || 'Lỗi không xác định';
    const entry = `[${vnTime.short} GMT+7] ❌ GỬI LỜI MỜI KẾT BẠN THẤT BẠI\n` +
      `├─ 📞 Số điện thoại: ${phone}\n` +
      `├─ 👤 Họ tên: ${options.name || '[Không xác định]'}\n` +
      `├─ 🆔 UID: ${options.uid || 'N/A'}\n` +
      `├─ 💬 Lời nhắn: ${options.message || '[Không gửi được]'}\n` +
      `├─ 🖼️  Avatar: ${options.avatar || 'N/A'}\n` +
      `└─ ⚠️  Lỗi: ${errorMsg}\n` +
      `${'─'.repeat(80)}\n\n`;
    fs.appendFileSync(LOG_FILE, entry, "utf8");
  } catch (err) {
    console.error('Error logging friend request failed:', err);
  }
}

/**
 * Kết thúc job và ghi summary
 */
export function endJob() {
  try {
    writeLogSummary();
  } catch (err) {
    console.error('Error ending job log:', err);
  }
}

/**
 * Legacy functions for backward compatibility
 */
export function logInfo(message, extra) {
  // Để tương thích ngược, có thể log vào console
  console.log(`[INFO] ${message}`, extra || '');
}

export function logError(message, extra) {
  // Để tương thích ngược
  console.error(`[ERROR] ${message}`, extra || '');
}

export function logWarn(message, extra) {
  // Để tương thích ngược
  console.warn(`[WARN] ${message}`, extra || '');
}

export function getLogFilePath() {
  return LOG_FILE;
}
