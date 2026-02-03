import { logError } from "../utils/logger.js";

// Allow simple workspace IDs: letters, numbers, underscore, dash. 3..64 chars.
const WORKSPACE_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

export function workspaceMiddleware(req, res, next) {
  const raw = req.header("X-Workspace-Id");
  const workspaceId = (raw || "").trim();

  if (!workspaceId) {
    return res.status(400).json({
      success: false,
      message: "Thiếu header X-Workspace-Id",
    });
  }

  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    logError("workspace_invalid_id", { workspaceId });
    return res.status(400).json({
      success: false,
      message:
        "Workspace ID không hợp lệ. Chỉ cho phép A-Z a-z 0-9 _ - và độ dài 3..64.",
    });
  }

  req.workspaceId = workspaceId;
  return next();
}


