import fs from "fs";
import { isSafeResultFilename, resolveUploadPath } from "../utils/file.js";
import { logError, logInfo } from "../utils/logger.js";

export function downloadResultFile(req, res) {
  let { filename } = req.params;

  // Decode URL-encoded filename (handle spaces and special characters)
  try {
    filename = decodeURIComponent(filename);
  } catch (error) {
    // If decoding fails, use original filename
    logError("download_decode_error", { filename: req.params.filename, error: error?.message });
  }

  if (!isSafeResultFilename(filename)) {
    logError("download_invalid_filename", { filename, original: req.params.filename });
    return res.status(400).json({
      error: "Invalid filename",
    });
  }

  const filePath = resolveUploadPath(filename);

  // Check if file exists before attempting download
  if (!fs.existsSync(filePath)) {
    logError("download_file_not_found", { filename, filePath });
    return res.status(404).json({
      error: "File not found",
    });
  }

  logInfo("download_file_requested", { filename, filePath });

  res.download(filePath, filename, (err) => {
    if (err) {
      logError("download_error", {
        filename,
        filePath,
        error: err?.message || String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({
          error: "Download failed",
        });
      }
    } else {
      logInfo("download_success", { filename });
    }
  });
}

