import fs from "fs";
import path from "path";
import { UPLOAD_DIR } from "../config/constants.js";

export function ensureDir(dirPath = UPLOAD_DIR) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
}

export function isSafeResultFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  
  // Accept format: data_zalo_result_excel_TIMESTAMP_HASH.xlsx
  // or legacy format: data_zalo_result_TIMESTAMP.xlsx
  return /^data_zalo_result(_excel_\d+_[a-f0-9]+|\d+)\.xlsx$/.test(filename);
}

export function resolveUploadPath(filename) {
  return path.join(UPLOAD_DIR, filename);
}

