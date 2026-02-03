import { Zalo, ThreadType, LoginQRCallbackEventType } from "zca-js";
import sizeOf from "image-size";
import fs from "fs";
import path from "path";
import { logInfo, logError, logWarn } from "../utils/logger.js";
import {
  ensureWorkspaceQrDir,
  resolveWorkspaceQrPath,
} from "../utils/file.js";

const sessions = new Map(); // workspaceId -> session
const QR_GENERATION_TIMEOUT = 30000; // 30 seconds

function getOrCreateSession(workspaceId) {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  let s = sessions.get(workspaceId);
  if (s) return s;

  s = {
    workspaceId,
    zalo: null,
    api: null,
    initialized: false,
    initPromise: null,

    qrInitPromise: null,
    qrGeneratedPromise: null,
    qrGeneratedResolve: null,
    qrGeneratedReject: null,
    currentQrFilename: null,
  };
  sessions.set(workspaceId, s);
  return s;
}

/**
 * Generate unique QR filename with timestamp
 * @returns {string} Filename like "qr_1234567890.png"
 */
function generateQrFileName() {
  return `qr_${Date.now()}.png`;
}

/**
 * Get full path for QR file
 * @param {string} filename - QR filename
 * @returns {string} Full path to QR file
 */
function getQrPath(workspaceId, filename) {
  ensureWorkspaceQrDir(workspaceId);
  return resolveWorkspaceQrPath(workspaceId, filename);
}

/**
 * Cleanup old QR files, keeping only the current one
 * @param {string} keepFilename - Filename to keep (current QR)
 */
function cleanupOldQrFiles(workspaceId, keepFilename) {
  try {
    const qrDir = ensureWorkspaceQrDir(workspaceId);
    const files = fs.readdirSync(qrDir);
    const qrFiles = files.filter(file => 
      file.startsWith("qr_") && file.endsWith(".png") && file !== keepFilename
    );
    
    let deletedCount = 0;
    for (const file of qrFiles) {
      try {
        fs.unlinkSync(path.join(qrDir, file));
        deletedCount++;
        logInfo("qr_old_file_deleted", { filename: file });
      } catch (error) {
        logWarn("qr_cleanup_file_failed", {
          filename: file,
          error: error?.message || String(error),
        });
      }
    }
    
    if (deletedCount > 0) {
      logInfo("qr_cleanup_completed", { deletedCount, kept: keepFilename });
    }
  } catch (error) {
    logError("qr_cleanup_error", {
      error: error?.message || String(error),
    });
  }
}

function stopListenerAndClear(session) {
  try {
    if (session?.api?.listener) {
      try {
        session.api.listener.stop();
      } catch {
        // ignore stop errors
      }
    }
  } finally {
    if (session) {
      session.api = null;
      session.initialized = false;
    }
  }
  
  // Reset QR generation promise
  if (session?.qrGeneratedReject) {
    session.qrGeneratedReject(new Error("QR generation cancelled"));
  }
  if (session) {
    session.qrGeneratedPromise = null;
    session.qrGeneratedResolve = null;
    session.qrGeneratedReject = null;
  }
}

/**
 * Create QR generation promise for tracking
 */
function createQrGenerationPromise() {
  // NOTE: requires `this` to be bound to session
  this.qrGeneratedPromise = new Promise((resolve, reject) => {
    this.qrGeneratedResolve = resolve;
    this.qrGeneratedReject = reject;
  });
  
  // Set timeout
  setTimeout(() => {
    if (this.qrGeneratedReject) {
      this.qrGeneratedReject(new Error("QR generation timeout"));
      this.qrGeneratedReject = null;
      this.qrGeneratedResolve = null;
    }
  }, QR_GENERATION_TIMEOUT);
  
  return this.qrGeneratedPromise;
}

/**
 * Callback handler for loginQR events
 */
function createLoginQRCallback(session) {
  return async (event) => {
    try {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated: {
          // Generate unique filename for this QR code
          const filename = generateQrFileName();
          const qrPath = getQrPath(session.workspaceId, filename);
          session.currentQrFilename = filename;
          
          logInfo("qr_code_generated", {
            code: event.data?.code,
            hasImage: !!event.data?.image,
            filename,
            workspaceId: session.workspaceId,
          });
          
          // Save QR code to file using the action
          if (event.actions?.saveToFile) {
            try {
              await event.actions.saveToFile(qrPath);
              logInfo("qr_code_saved", { path: qrPath, filename });
              
              // Resolve promise when file is saved with filename
              if (session.qrGeneratedResolve) {
                session.qrGeneratedResolve(filename);
                session.qrGeneratedResolve = null;
                session.qrGeneratedReject = null;
              }
            } catch (error) {
              logError("qr_code_save_failed", {
                error: error?.message || String(error),
                path: qrPath,
                filename,
              });
              if (session.qrGeneratedReject) {
                session.qrGeneratedReject(error);
                session.qrGeneratedReject = null;
                session.qrGeneratedResolve = null;
              }
            }
          } else {
            logWarn("qr_code_no_save_action", {});
            // Fallback: if no saveToFile action, resolve anyway with filename
            if (session.qrGeneratedResolve) {
              session.qrGeneratedResolve(filename);
              session.qrGeneratedResolve = null;
              session.qrGeneratedReject = null;
            }
          }
          break;
        }
        
        case LoginQRCallbackEventType.QRCodeExpired: {
          logWarn("qr_code_expired", {});
          // QR expired - could auto-retry here if needed
          // For now, just log it
          break;
        }
        
        case LoginQRCallbackEventType.QRCodeScanned: {
          logInfo("qr_code_scanned", {
            displayName: event.data?.display_name,
            avatar: event.data?.avatar,
            workspaceId: session.workspaceId,
          });
          break;
        }
        
        case LoginQRCallbackEventType.QRCodeDeclined: {
          logWarn("qr_code_declined", {
            code: event.data?.code,
          });
          // QR declined by user
          break;
        }
        
        case LoginQRCallbackEventType.GotLoginInfo: {
          logInfo("qr_login_success", {
            hasCookie: !!event.data?.cookie,
            imei: event.data?.imei,
            workspaceId: session.workspaceId,
          });
          break;
        }
        
        default:
          logWarn("qr_unknown_event", { eventType: event.type });
      }
    } catch (error) {
      logError("qr_callback_error", {
        error: error?.message || String(error),
        eventType: event.type,
        workspaceId: session.workspaceId,
      });
    }
  };
}

/**
 * Initialize Zalo and generate QR code (non-blocking for scan result)
 * Returns immediately after QR is generated, continues login in background
 * @returns {Promise<string>} Promise that resolves with QR filename
 */
export async function initZaloQR(workspaceId) {
  const session = getOrCreateSession(workspaceId);

  if (session.qrInitPromise) {
    return await session.qrGeneratedPromise;
  }

  session.qrInitPromise = (async () => {
    // Create promise for QR generation tracking
    createQrGenerationPromise.call(session);
    
    session.zalo = new Zalo({
      selfListen: false,
      checkUpdate: true,
      logging: false,
      imageMetadataGetter: async (imagePath) => {
        try {
          const buffer = fs.readFileSync(imagePath);
          const dimensions = sizeOf(buffer);
          return {
            width: dimensions.width || 1920,
            height: dimensions.height || 1080,
          };
        } catch (error) {
          logError("image_metadata_error", {
            error: error?.message || String(error),
            imagePath,
            workspaceId,
          });
          return { width: 1920, height: 1080 };
        }
      },
    });

    const callback = createLoginQRCallback(session);
    
    let loginQRPromise;
    try {
      loginQRPromise = session.zalo.loginQR(
        {
        userAgent: "",
        },
        callback
      );
    } catch (error) {
      logError("login_qr_start_error", {
        error: error?.message || String(error),
        errorName: error?.name,
        workspaceId,
      });
      throw error;
    }

    // Background: login completion
    loginQRPromise
      .then((api) => {
        if (api) {
          session.api = api;
          session.api.listener.start();
          session.initialized = true;
          logInfo("zalo_login_completed", { workspaceId, ownId: api.getOwnId?.() });
        }
        return api;
      })
      .catch((error) => {
        logError("login_qr_background_error", {
          error: error?.message || String(error),
          errorName: error?.name,
          code: error?.code,
          workspaceId,
        });
        session.initialized = false;
        return null;
      });

    const filename = await session.qrGeneratedPromise;
    session.currentQrFilename = filename;
    logInfo("zalo_init_qr_ready", { filename, workspaceId });
    return filename;
  })().finally(() => {
    session.qrInitPromise = null;
  });

  return session.qrInitPromise;
}

export async function initZalo(workspaceId) {
  const session = getOrCreateSession(workspaceId);
  if (session.initPromise) return session.initPromise;

  session.initPromise = (async () => {
    try {
      await initZaloQR(workspaceId);
      
      // Wait a short time for login completion, but don't block long
      try {
        await Promise.race([
          new Promise((resolve) => {
            if (session.api && session.initialized) {
              resolve(session.api);
              return;
            }
            const checkInterval = setInterval(() => {
              if (session.api && session.initialized) {
                clearInterval(checkInterval);
                resolve(session.api);
              }
            }, 100);
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve(session.api || null);
            }, 2000);
          }),
        ]);
      } catch {
        // ignore
      }
      
      logInfo("zalo_init_success", {
        workspaceId,
        hasApi: !!session.api,
        initialized: session.initialized,
      });
      return session.api;
    } catch (error) {
      session.initialized = false;
      logError("zalo_init_failed", {
        workspaceId,
        error: error?.message || String(error),
      });
      throw error;
    }
  })().finally(() => {
    session.initPromise = null;
  });

  return session.initPromise;
}

export function getZaloStatus(workspaceId) {
  if (!workspaceId) {
    let anyInitialized = false;
    let anyApi = false;
    for (const s of sessions.values()) {
      if (s.initialized) anyInitialized = true;
      if (s.api) anyApi = true;
      if (anyInitialized && anyApi) break;
    }
    return {
      initialized: anyInitialized,
      hasApi: anyApi,
      workspaceCount: sessions.size,
    };
  }

  const session = getOrCreateSession(workspaceId);
  return {
    initialized: session.initialized,
    hasApi: !!session.api,
  };
}

export function getZaloApi(workspaceId) {
  if (!workspaceId) return null;
  const session = getOrCreateSession(workspaceId);
  return session.api;
}

/**
 * Get current QR filename
 * @returns {string|null} Current QR filename or null if not available
 */
export function getCurrentQrFilename(workspaceId) {
  const session = getOrCreateSession(workspaceId);
  return session.currentQrFilename;
}

/**
 * Find the latest QR file in the directory
 * @returns {string|null} Latest QR filename or null if not found
 */
export function findLatestQrFile(workspaceId) {
  try {
    const qrDir = ensureWorkspaceQrDir(workspaceId);
    const files = fs.readdirSync(qrDir);
    const qrFiles = files
      .filter(file => file.startsWith("qr_") && file.endsWith(".png"))
      .map(file => ({
        name: file,
        path: path.join(qrDir, file),
        mtime: fs.statSync(path.join(qrDir, file)).mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (qrFiles.length > 0) {
      return qrFiles[0].name;
    }
    return null;
  } catch (error) {
    logError("find_latest_qr_error", {
      error: error?.message || String(error),
      workspaceId,
    });
    return null;
  }
}

export async function regenerateQr(workspaceId) {
  try {
    const session = getOrCreateSession(workspaceId);
    logInfo("qr_regenerate_start", { workspaceId });
    
    // Reset current in-memory session and force a new QR image
    stopListenerAndClear(session);
    
    // Reset promises to force new initialization
    session.initPromise = null;
    session.qrInitPromise = null;
    
    // Cleanup old QR files before creating new one
    // Keep current filename if exists
    cleanupOldQrFiles(workspaceId, session.currentQrFilename);
    session.currentQrFilename = null;

    // Use initZaloQR() which only waits for QR generation, not scan result
    // This returns quickly after QR is created
    const filename = await initZaloQR(workspaceId);
    session.currentQrFilename = filename;
    
    // Cleanup old files again after new QR is created
    cleanupOldQrFiles(workspaceId, filename);
    
    logInfo("qr_regenerate_success", { filename, workspaceId });
    return { success: true, filename };
  } catch (error) {
    logError("qr_regenerate_error", {
      error: error?.message || String(error),
      workspaceId,
    });
    
    // Fallback: check if we have current filename
    const session = getOrCreateSession(workspaceId);
    if (
      session.currentQrFilename &&
      fs.existsSync(getQrPath(workspaceId, session.currentQrFilename))
    ) {
      logInfo("qr_regenerate_fallback_success", {
        filename: session.currentQrFilename,
        message: "QR file exists despite error",
        workspaceId,
      });
      return { success: true, filename: session.currentQrFilename };
    }
    
    // Try to find latest QR file as last resort
    try {
      const latestFile = findLatestQrFileByWorkspace(workspaceId);
      if (latestFile) {
        session.currentQrFilename = latestFile;
        logInfo("qr_regenerate_fallback_found_latest", {
          filename: latestFile,
          workspaceId,
        });
        return { success: true, filename: latestFile };
      }
    } catch (fallbackError) {
      logError("qr_regenerate_fallback_error", {
        error: fallbackError?.message || String(fallbackError),
        workspaceId,
      });
    }
    
    throw error;
  }
}

export { ThreadType };

