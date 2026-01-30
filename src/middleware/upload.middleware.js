import multer from "multer";
import { UPLOAD_DIR } from "../config/constants.js";
import { ensureDir } from "../utils/file.js";

ensureDir(UPLOAD_DIR);

const upload = multer({ dest: UPLOAD_DIR });

export const uploadExcelMiddleware = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "media", maxCount: 10 },
]);

