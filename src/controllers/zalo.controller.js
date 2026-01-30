import { 
  getZaloStatus, 
  regenerateQr, 
  getCurrentQrFilename,
  findLatestQrFile 
} from "../services/zalo.service.js";
import { logError, logInfo } from "../utils/logger.js";
import fs from "fs";
import path from "path";

export function getZaloStatusHandler(req, res) {
  try {
    const status = getZaloStatus();
    return res.json({
      initialized: status.initialized,
      api: status.hasApi ? "available" : "not available",
    });
  } catch (error) {
    logError("zalo_status_error", {
      error: error?.message || String(error),
    });
    return res.status(500).json({
      error: "Không thể lấy trạng thái Zalo",
      message: error?.message || "Internal server error",
    });
  }
}

export function getQrCode(req, res) {
  // Get filename from query parameter or route parameter
  let filename = req.query.filename || req.params.filename;
  
  // If no filename provided, try to get current or find latest
  if (!filename) {
    filename = getCurrentQrFilename() || findLatestQrFile();
  }
  
  // If still no filename, return 404
  if (!filename) {
    logError("qr_file_not_found", {
      message: "No QR filename available",
    });
    return res.status(404).json({
      error: "QR code not found",
      message: "QR code chưa được tạo hoặc hết hạn. Vui lòng tải lại trang hoặc tạo QR mới.",
    });
  }
  
  // Validate filename format (security: only allow qr_*.png)
  if (!filename.match(/^qr_\d+\.png$/)) {
    logError("qr_invalid_filename", {
      filename,
    });
    return res.status(400).json({
      error: "Invalid filename format",
      message: "Tên file QR không hợp lệ.",
    });
  }
  
  const filePath = path.join(".", filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    logError("qr_file_not_found", {
      filename,
      path: filePath,
    });
    return res.status(404).json({
      error: "QR code not found",
      message: "QR code chưa được tạo hoặc hết hạn. Vui lòng tải lại trang hoặc tạo QR mới.",
    });
  }
  
  // Send file
  res.sendFile(filename, { root: "." }, (err) => {
    if (err) {
      logError("qr_file_send_error", {
        error: err?.message || String(err),
        filename,
        path: filePath,
      });
      if (!res.headersSent) {
        res.status(500).json({
          error: "Error serving QR file",
          message: "Không thể đọc file QR code.",
        });
      }
    } else {
      logInfo("qr_file_served", { filename });
    }
  });
}

export async function regenerateQrHandler(req, res) {
  try {
    logInfo("qr_regenerate_request", {});
    
    const result = await regenerateQr();
    
    if (!result || !result.success) {
      logError("qr_regenerate_failed", {
        message: "QR generation did not complete successfully",
        result,
      });
      return res.status(500).json({
        success: false,
        message: "QR chưa sẵn sàng. Có thể do timeout hoặc lỗi kết nối. Vui lòng thử lại sau vài giây.",
        filename: result?.filename || null,
      });
    }

    logInfo("qr_regenerate_response_success", {
      filename: result.filename,
    });
    return res.json({ 
      success: true,
      message: "QR code đã được tạo thành công",
      filename: result.filename,
    });
  } catch (error) {
    logError("qr_regenerate_handler_error", {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    
    // Determine error type for better user message
    let userMessage = "Không thể tạo QR mới";
    if (error?.message?.includes("timeout")) {
      userMessage = "QR code không được tạo trong thời gian cho phép. Vui lòng thử lại.";
    } else if (error?.message?.includes("network") || error?.message?.includes("ECONNREFUSED")) {
      userMessage = "Lỗi kết nối đến Zalo. Vui lòng kiểm tra kết nối internet và thử lại.";
    } else if (error?.message) {
      userMessage = `Lỗi: ${error.message}`;
    }
    
    return res.status(500).json({
      success: false,
      message: userMessage,
      filename: null,
      error: process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
  }
}

