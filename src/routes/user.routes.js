import { Router } from "express";
import { workspaceMiddleware } from "../middleware/workspace.middleware.js";
import {
  searchUserHandler,
  sendFriendRequestHandler,
} from "../controllers/user.controller.js";

const router = Router();

// Require workspace header for all user actions
router.post("/api/users/search", workspaceMiddleware, searchUserHandler);
router.post("/api/users/friend-request", workspaceMiddleware, sendFriendRequestHandler);

export default router;

