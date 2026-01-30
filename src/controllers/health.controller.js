import { getZaloStatus } from "../services/zalo.service.js";

export function getApiInfo(req, res) {
  const status = getZaloStatus();
  res.json({
    status: "running",
    message: "Zalo Service Server",
    zaloInitialized: status.initialized,
  });
}

export function getHealth(req, res) {
  const status = getZaloStatus();
  res.json({
    status: "ok",
    zaloInitialized: status.initialized,
    timestamp: new Date().toISOString(),
  });
}

