import { Zalo, ThreadType, LoginQRCallbackEventType } from "zca-js";
import sizeOf from "image-size";
import fs from "fs";
import path from "path";
import { logInfo, logError, logWarn } from "../utils/logger.js";

let zaloApi = null;
let zaloInitialized = false;
let initPromise = null;
let qrGeneratedPromise = null;
let qrGeneratedResolve = null;
let qrGeneratedReject = null;
let currentQrFilename = null; // Current QR filename
const QR_GENERATION_TIMEOUT = 30000; // 30 seconds

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
function getQrPath(filename) {
  return path.join(".", filename);
}

/**
 * Cleanup old QR files, keeping only the current one
 * @param {string} keepFilename - Filename to keep (current QR)
 */
function cleanupOldQrFiles(keepFilename) {
  try {
    const files = fs.readdirSync(".");
    const qrFiles = files.filter(file => 
      file.startsWith("qr_") && file.endsWith(".png") && file !== keepFilename
    );
    
    let deletedCount = 0;
    for (const file of qrFiles) {
      try {
        fs.unlinkSync(path.join(".", file));
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

function stopListenerAndClear() {
  try {
    if (zaloApi?.listener) {
      try {
        zaloApi.listener.stop();
      } catch {
        // ignore stop errors
      }
    }
  } finally {
    zaloApi = null;
    zaloInitialized = false;
  }
  
  // Reset QR generation promise
  if (qrGeneratedReject) {
    qrGeneratedReject(new Error("QR generation cancelled"));
  }
  qrGeneratedPromise = null;
  qrGeneratedResolve = null;
  qrGeneratedReject = null;
}

/**
 * Create QR generation promise for tracking
 */
function createQrGenerationPromise() {
  qrGeneratedPromise = new Promise((resolve, reject) => {
    qrGeneratedResolve = resolve;
    qrGeneratedReject = reject;
  });
  
  // Set timeout
  setTimeout(() => {
    if (qrGeneratedReject) {
      qrGeneratedReject(new Error("QR generation timeout"));
      qrGeneratedReject = null;
      qrGeneratedResolve = null;
    }
  }, QR_GENERATION_TIMEOUT);
  
  return qrGeneratedPromise;
}

/**
 * Callback handler for loginQR events
 */
function createLoginQRCallback() {
  return async (event) => {
    try {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated: {
          // Generate unique filename for this QR code
          const filename = generateQrFileName();
          const qrPath = getQrPath(filename);
          currentQrFilename = filename;
          
          logInfo("qr_code_generated", {
            code: event.data?.code,
            hasImage: !!event.data?.image,
            filename,
          });
          
          // Save QR code to file using the action
          if (event.actions?.saveToFile) {
            try {
              await event.actions.saveToFile(qrPath);
              logInfo("qr_code_saved", { path: qrPath, filename });
              
              // Resolve promise when file is saved with filename
              if (qrGeneratedResolve) {
                qrGeneratedResolve(filename);
                qrGeneratedResolve = null;
                qrGeneratedReject = null;
              }
            } catch (error) {
              logError("qr_code_save_failed", {
                error: error?.message || String(error),
                path: qrPath,
                filename,
              });
              if (qrGeneratedReject) {
                qrGeneratedReject(error);
                qrGeneratedReject = null;
                qrGeneratedResolve = null;
              }
            }
          } else {
            logWarn("qr_code_no_save_action", {});
            // Fallback: if no saveToFile action, resolve anyway with filename
            if (qrGeneratedResolve) {
              qrGeneratedResolve(filename);
              qrGeneratedResolve = null;
              qrGeneratedReject = null;
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
      });
    }
  };
}

let qrInitPromise = null; // Separate promise for QR generation only

/**
 * Initialize Zalo and generate QR code (non-blocking for scan result)
 * Returns immediately after QR is generated, continues login in background
 * @returns {Promise<string>} Promise that resolves with QR filename
 */
export async function initZaloQR() {
  if (qrInitPromise) {
    // If already initializing QR, wait for QR generation
    try {
      const filename = await qrGeneratedPromise;
      return filename;
    } catch (error) {
      throw error;
    }
  }

  qrInitPromise = (async () => {
    // Create promise for QR generation tracking
    createQrGenerationPromise();
    
    const zalo = new Zalo({
      selfListen: false,
      checkUpdate: true,
      logging: false,
      imageMetadataGetter: async (imagePath) => {
        try {
          // Read file as buffer and pass to image-size
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
          });
          // Return default dimensions if error
          return { width: 1920, height: 1080 };
        }
      },
    });

    // Use callback instead of relying on qrPath option
    const callback = createLoginQRCallback();
    
    // Start loginQR - handle promise separately to avoid blocking
    // Wrap in try-catch to handle any immediate errors
    let loginQRPromise;
    try {
      loginQRPromise = zalo.loginQR({
        userAgent: "",
      }, callback);
    } catch (error) {
      logError("login_qr_start_error", {
        error: error?.message || String(error),
        errorName: error?.name,
      });
      throw error;
    }

    // Handle loginQR promise in background - don't block QR generation
    // This prevents unhandled rejection and allows login to continue
    loginQRPromise
      .then((api) => {
        if (api) {
          zaloApi = api;
          zaloApi.listener.start();
          zaloInitialized = true;
          logInfo("zalo_login_completed", {});
        }
        return api;
      })
      .catch((error) => {
        // Handle errors from loginQR to avoid unhandled rejection
        logError("login_qr_background_error", {
          error: error?.message || String(error),
          errorName: error?.name,
          code: error?.code,
        });
        zaloInitialized = false;
        // Don't throw, just log - this is background process
        return null;
      });

    // Wait only for QR code to be generated and saved (not scan result)
    const filename = await qrGeneratedPromise;
    currentQrFilename = filename;
    logInfo("zalo_init_qr_ready", { filename });
    return filename;
  })().finally(() => {
    qrInitPromise = null;
  });

  return qrInitPromise;
}

export async function initZalo() {
  if (initPromise) return initPromise;

  // Use initZaloQR for QR generation, then continue with login
  initPromise = (async () => {
    try {
      // Generate QR first (fast) - this returns immediately after QR is created
      await initZaloQR();
      
      // Login process is already running in background from initZaloQR
      // Wait a bit to see if login completes quickly
      // But don't block too long - login continues in background
      try {
        await Promise.race([
          new Promise((resolve) => {
            // Check if login already completed
            if (zaloApi && zaloInitialized) {
              resolve(zaloApi);
              return;
            }
            // Poll for login completion
            const checkInterval = setInterval(() => {
              if (zaloApi && zaloInitialized) {
                clearInterval(checkInterval);
                resolve(zaloApi);
              }
            }, 100);
            // Timeout after 2 seconds - don't block too long
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve(zaloApi || null);
            }, 2000);
          }),
        ]);
      } catch {
        // Ignore errors, login continues in background
      }
      
      logInfo("zalo_init_success", {
        hasApi: !!zaloApi,
        initialized: zaloInitialized,
      });
      return zaloApi;
    } catch (error) {
      zaloInitialized = false;
      logError("zalo_init_failed", {
        error: error?.message || String(error),
      });
      throw error;
    }
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export function getZaloStatus() {
  return {
    initialized: zaloInitialized,
    hasApi: !!zaloApi,
  };
}

export function getZaloApi() {
  return zaloApi;
}

/**
 * Get current QR filename
 * @returns {string|null} Current QR filename or null if not available
 */
export function getCurrentQrFilename() {
  return currentQrFilename;
}

/**
 * Find the latest QR file in the directory
 * @returns {string|null} Latest QR filename or null if not found
 */
export function findLatestQrFile() {
  try {
    const files = fs.readdirSync(".");
    const qrFiles = files
      .filter(file => file.startsWith("qr_") && file.endsWith(".png"))
      .map(file => ({
        name: file,
        path: path.join(".", file),
        mtime: fs.statSync(path.join(".", file)).mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (qrFiles.length > 0) {
      return qrFiles[0].name;
    }
    return null;
  } catch (error) {
    logError("find_latest_qr_error", {
      error: error?.message || String(error),
    });
    return null;
  }
}

export async function regenerateQr() {
  try {
    logInfo("qr_regenerate_start", {});
    
    // Reset current in-memory session and force a new QR image
    stopListenerAndClear();
    
    // Reset promises to force new initialization
    initPromise = null;
    qrInitPromise = null;
    
    // Cleanup old QR files before creating new one
    // Keep current filename if exists
    cleanupOldQrFiles(currentQrFilename);
    currentQrFilename = null;

    // Use initZaloQR() which only waits for QR generation, not scan result
    // This returns quickly after QR is created
    const filename = await initZaloQR();
    currentQrFilename = filename;
    
    // Cleanup old files again after new QR is created
    cleanupOldQrFiles(filename);
    
    logInfo("qr_regenerate_success", { filename });
    return { success: true, filename };
  } catch (error) {
    logError("qr_regenerate_error", {
      error: error?.message || String(error),
    });
    
    // Fallback: check if we have current filename
    if (currentQrFilename && fs.existsSync(getQrPath(currentQrFilename))) {
      logInfo("qr_regenerate_fallback_success", {
        filename: currentQrFilename,
        message: "QR file exists despite error",
      });
      return { success: true, filename: currentQrFilename };
    }
    
    // Try to find latest QR file as last resort
    try {
      const latestFile = findLatestQrFile();
      if (latestFile) {
        currentQrFilename = latestFile;
        logInfo("qr_regenerate_fallback_found_latest", {
          filename: latestFile,
        });
        return { success: true, filename: latestFile };
      }
    } catch (fallbackError) {
      logError("qr_regenerate_fallback_error", {
        error: fallbackError?.message || String(fallbackError),
      });
    }
    
    throw error;
  }
}

export { ThreadType };

