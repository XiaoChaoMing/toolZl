import app from "./app.js";
import { initZalo } from "./services/zalo.service.js";
import { logError } from "./utils/logger.js";

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

const server = app.listen(PORT, HOST, async () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  await initZalo();
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    logError("server_listen_eaddrinuse", {
      port: PORT,
      code: error.code,
    });
    console.error(
      `[listen] Port ${PORT} is already in use. Set PORT env var to another value.`
    );
    process.exit(1);
  }

  logError("server_listen_error", {
    message: error?.message || String(error),
    code: error?.code || null,
  });
  console.error("[listen] Server error:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError("unhandled_rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (error) => {
  logError("uncaught_exception", {
    message: error?.message || String(error),
    stack: error?.stack || null,
  });
  console.error("[uncaughtException]", error);
  process.exit(1);
});

