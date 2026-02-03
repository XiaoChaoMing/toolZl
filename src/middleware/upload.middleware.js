import multer from "multer";
import { UPLOAD_DIR } from "../config/constants.js";
import { ensureDir, ensureWorkspaceUploadDir } from "../utils/file.js";

ensureDir(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Prefer per-workspace uploads dir when workspaceId is present
    if (req.workspaceId) {
      try {
        const dir = ensureWorkspaceUploadDir(req.workspaceId);
        return cb(null, dir);
      } catch (e) {
        return cb(e);
      }
    }

    // Fallback to legacy global uploads dir
    return cb(null, UPLOAD_DIR);
  },
});

const upload = multer({ storage });

export const uploadExcelMiddleware = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "media", maxCount: 10 },
]);

