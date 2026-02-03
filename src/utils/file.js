import fs from "fs";
import path from "path";
import { UPLOAD_DIR } from "../config/constants.js";

export function resolveWorkspaceDir(workspaceId) {
  return path.join("workspaces", workspaceId);
}

export function ensureWorkspaceDir(workspaceId) {
  const dir = resolveWorkspaceDir(workspaceId);
  ensureDir(dir);
  return dir;
}

export function resolveWorkspaceUploadDir(workspaceId) {
  return path.join(resolveWorkspaceDir(workspaceId), UPLOAD_DIR);
}

export function ensureWorkspaceUploadDir(workspaceId) {
  const dir = resolveWorkspaceUploadDir(workspaceId);
  ensureDir(dir);
  return dir;
}

export function resolveWorkspaceUploadPath(workspaceId, filename) {
  return path.join(resolveWorkspaceUploadDir(workspaceId), filename);
}

export function resolveWorkspaceQrDir(workspaceId) {
  return path.join(resolveWorkspaceDir(workspaceId), "qr");
}

export function ensureWorkspaceQrDir(workspaceId) {
  const dir = resolveWorkspaceQrDir(workspaceId);
  ensureDir(dir);
  return dir;
}

export function resolveWorkspaceQrPath(workspaceId, filename) {
  return path.join(resolveWorkspaceQrDir(workspaceId), filename);
}

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

