import { getZaloApi, getZaloStatus } from "../services/zalo.service.js";
import { logError, logInfo } from "../utils/logger.js";
import {
  normalizeVietnamesePhoneNumber,
  isVietnamesePhoneNumberValid,
} from "../utils/phone.js";

export async function searchUserHandler(req, res) {
  try {
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({
        success: false,
        error: "Thiếu thông tin. Vui lòng cung cấp số điện thoại hoặc UID.",
      });
    }

    // Check Zalo connection
    const status = getZaloStatus(req.workspaceId);
    if (!status.initialized || !status.hasApi) {
      return res.status(503).json({
        success: false,
        error: "Zalo chưa được kết nối. Vui lòng quét QR code để đăng nhập.",
      });
    }

    const zaloApi = getZaloApi(req.workspaceId);
    if (!zaloApi) {
      return res.status(503).json({
        success: false,
        error: "Zalo API chưa sẵn sàng.",
      });
    }

    const inputValue = String(value).trim();

    // Auto-detect: Try phone number first
    const normalizedPhone = normalizeVietnamesePhoneNumber(inputValue);
    if (normalizedPhone && isVietnamesePhoneNumberValid(inputValue)) {
      // It's a valid phone number, use findUser
      try {
        logInfo("user_search_by_phone", { phone: normalizedPhone });
        const user = await zaloApi.findUser(normalizedPhone);

        if (!user) {
          return res.json({
            success: true,
            user: null,
            message: "Không tìm thấy người dùng với số điện thoại này.",
          });
        }

        // Format user response
        const userInfo = {
          name: user.name || user.displayName || user.zalo_name || "N/A",
          avatar: user.avatar || user.avatarUrl || null,
          uid: user.uid || user.globalId || user.userId || null,
          phone: user.phone || normalizedPhone || "N/A",
        };

        logInfo("user_search_success", {
          type: "phone",
          uid: userInfo.uid,
          name: userInfo.name,
        });

        return res.json({
          success: true,
          user: userInfo,
        });
      } catch (error) {
        logError("user_search_by_phone_failed", {
          phone: normalizedPhone,
          error: error?.message || String(error),
        });
        return res.status(500).json({
          success: false,
          error: error?.message || "Không thể tìm kiếm người dùng. Vui lòng thử lại.",
        });
      }
    }

    // Not a valid phone number, treat as UID
    // UID format validation (typically numeric string)
    if (!/^\d+$/.test(inputValue)) {
      return res.status(400).json({
        success: false,
        error: "Input không hợp lệ. Vui lòng nhập số điện thoại Việt Nam 10 chữ số hoặc UID (chuỗi số).",
      });
    }

    // Return a minimal user object with just UID so frontend can send friend request
    // Note: We can't get name/avatar/phone from UID alone
    return res.json({
      success: true,
      user: {
        name: "N/A",
        avatar: null,
        uid: inputValue,
        phone: "N/A",
      },
      message: "Không thể tìm kiếm thông tin người dùng bằng UID. Bạn vẫn có thể gửi lời mời kết bạn với UID này.",
    });
  } catch (error) {
    logError("user_search_handler_error", {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Lỗi server khi tìm kiếm người dùng. Vui lòng thử lại.",
    });
  }
}

export async function sendFriendRequestHandler(req, res) {
  try {
    const { uid, message } = req.body;

    if (!uid) {
      return res.status(400).json({
        success: false,
        error: "Thiếu UID. Vui lòng cung cấp UID của người dùng.",
      });
    }

    const uidString = String(uid).trim();
    if (!uidString || uidString === "" || !/^\d+$/.test(uidString)) {
      return res.status(400).json({
        success: false,
        error: "UID không hợp lệ. UID phải là chuỗi số.",
      });
    }

    // Check Zalo connection
    const status = getZaloStatus(req.workspaceId);
    if (!status.initialized || !status.hasApi) {
      return res.status(503).json({
        success: false,
        error: "Zalo chưa được kết nối. Vui lòng quét QR code để đăng nhập.",
      });
    }

    const zaloApi = getZaloApi(req.workspaceId);
    if (!zaloApi) {
      return res.status(503).json({
        success: false,
        error: "Zalo API chưa sẵn sàng.",
      });
    }

    // Default message if not provided
    const friendRequestMessage = message || "Xin chào! Tôi muốn kết bạn với bạn.";

    try {
      logInfo("friend_request_send", { uid: uidString });
      
      // Call sendFriendRequest API
      // According to docs: api.sendFriendRequest(msg, userId)
      await zaloApi.sendFriendRequest(friendRequestMessage, uidString);

      logInfo("friend_request_success", { uid: uidString });
      return res.json({
        success: true,
        message: "Đã gửi lời mời kết bạn thành công.",
      });
    } catch (error) {
      logError("friend_request_failed", {
        uid: uidString,
        error: error?.message || String(error),
      });

      // Handle specific error cases
      let errorMessage = "Không thể gửi lời mời kết bạn.";
      if (error?.message) {
        errorMessage = error.message;
      }

      return res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  } catch (error) {
    logError("friend_request_handler_error", {
      error: error?.message || String(error),
      stack: error?.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Lỗi server khi gửi lời mời kết bạn. Vui lòng thử lại.",
    });
  }
}

