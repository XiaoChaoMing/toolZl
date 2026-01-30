# 🔵 Zalo Service - Hướng Dẫn Sử Dụng

Ứng dụng web để tìm kiếm user Zalo theo số điện thoại và gửi tin nhắn hàng loạt từ file Excel với khả năng theo dõi tiến độ real-time và điều khiển job (pause/resume/cancel).

---

## 📋 Yêu Cầu Hệ Thống

- **Node.js**: phiên bản 14.0 trở lên
- **npm**: phiên bản 6.0 trở lên
- **Trình duyệt web**: Chrome, Firefox, Safari, Edge (phiên bản gần đây)
- **Ứng dụng Zalo**: cài đặt trên điện thoại

---

## 🚀 Cài Đặt & Chạy

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Chạy ứng dụng

**Chế độ thường:**
```bash
npm start
```

**Chế độ phát triển (tự động reload khi có thay đổi):**
```bash
npm run dev
```

**Chạy trên port khác (nếu port 3000 bị chiếm):**
```bash
# Windows PowerShell
$env:PORT=3001; npm run dev

# Linux/Mac
PORT=3001 npm run dev
```

### 3. Truy cập ứng dụng

Mở trình duyệt và truy cập:
```
http://localhost:3000
```
(hoặc port bạn đã cấu hình)

---

## 📖 Hướng Dẫn Sử Dụng

### **Bước 1: Quét Mã QR Để Đăng Nhập**

1. Khi ứng dụng khởi động, bạn sẽ thấy **phần "Quét Mã QR Để Đăng Nhập"**
2. Mở ứng dụng **Zalo** trên điện thoại
3. Tìm chức năng **"Quét mã QR"** (thường ở bảng khảo sát hoặc menu)
4. Quét **mã QR** hiển thị trên màn hình
5. Xác nhận đăng nhập trên điện thoại
6. Trạng thái **"Zalo Service"** sẽ chuyển từ 🟡 (Đang kiểm tra) → 🟢 (Đã kết nối)

**⚠️ Lưu ý:** Mã QR chỉ có hiệu lực trong **5 phút**. Nếu hết hạn, nhấn **"🔄 Tải Lại QR"** để lấy mã mới.

---

### **Bước 2: Chuẩn Bị File Excel**

Tạo file Excel với nội dung như sau:

| Cột 1 | Cột 2 | Cột 3 | ... |
|-------|-------|-------|-----|
| Số điện thoại | (Kết quả tìm kiếm) | (Tên user) | ... |
| 0912345678 | | | |
| 0987654321 | | | |
| ... | | | |

**Yêu cầu:**
- Cột đầu tiên phải chứa **số điện thoại hợp lệ**
- Định dạng số: `0xxxxxxxxx` (10 chữ số) hoặc `+84xxxxxxxxx`
- File phải là `.xlsx` hoặc `.xls`

**Ví dụ file Excel:**
```
Số điện thoại
0912345678
0987654321
0903456789
```

---

### **Bước 3: Xử Lý File Excel**

1. Cuộn xuống phần **"📊 Xử Lý File Excel"**

2. **Chọn file Excel:**
   - Nhấn vào ô **"Chọn file Excel"**
   - Chọn file `.xlsx` hoặc `.xls` chứa danh sách số điện thoại
   - Sau khi chọn, hệ thống sẽ tự động đếm số lượng số điện thoại hợp lệ

3. **Thiết lập Timeout (tùy chọn):**
   - Timeout là **thời gian chờ tối đa khi gửi mỗi tin nhắn**
   - Giá trị mặc định: **5000 ms (5 giây)**
   - Phạm vi: **1000-30000 ms**
   - **Khuyến nghị:** 5000-10000 ms
   - Có thể dùng các nút preset: **5s**, **10s**, **15s**, **20s**

4. **Bắt đầu xử lý:**
   - Nhấn nút **"📤 Bắt Đầu Xử Lý"**
   - Hệ thống sẽ bắt đầu xử lý từng số điện thoại:
     - ✅ Kiểm tra định dạng số
     - ✅ Tìm user trên Zalo
     - ✅ Lấy thông tin user (tên, ID, SĐT, avatar)
     - ✅ Gửi tin nhắn tự động
     - ✅ Ghi lại kết quả vào Excel real-time

5. **Theo dõi tiến độ real-time:**
   - Thanh tiến độ hiển thị: `X/Y` (đã xử lý / tổng số) và phần trăm
   - Hiển thị số điện thoại đang được xử lý: **"Đang xác minh: 0912345678"**
   - File Excel được ghi real-time (mỗi 5 số), có thể tải về giữa chừng

6. **Điều khiển Job:**
   - **⏸️ Tạm Dừng**: Tạm dừng job đang chạy (có thể tiếp tục sau)
   - **▶️ Tiếp Tục**: Tiếp tục job đã tạm dừng
   - **❌ Huỷ**: Dừng job và kết thúc (file kết quả vẫn có thể tải về)
   - **❌ Xoá**: Xóa form và reset về trạng thái ban đầu

7. **Cảnh báo:**
   - Khi gặp lỗi quan trọng (rate-limit, vượt quá số request), hệ thống sẽ hiển thị cảnh báo màu vàng
   - Bạn có thể pause/resume để xử lý sau

---

### **Bước 4: Tải Xuống Kết Quả**

Sau khi hoàn thành hoặc giữa chừng, bạn sẽ thấy:

```
✅ Xử lý thành công!

Thống kê:
• Tổng số: 100
• Tìm thấy: 85
• Không tìm thấy: 10
• Gửi tin nhắn thành công: 80
• Gửi tin nhắn thất bại: 5
• Lỗi: 5

📥 Tải file kết quả (realtime)
```

**Nhấn "📥 Tải file kết quả"** để tải file Excel có chứa:
- ✅ Số điện thoại gốc
- ✅ Trạng thái tìm kiếm (hoặc thông báo lỗi chi tiết)
- ✅ Tên user
- ✅ ID user
- ✅ Số điện thoại user
- ✅ Avatar URL
- ✅ Kết quả gửi tin nhắn (hoặc thông báo lỗi chi tiết)

**Lưu ý:** File Excel được ghi real-time, bạn có thể tải về bất cứ lúc nào (khi đang chạy, paused, cancelled, hoặc completed).

---

## 📊 Cấu Trúc File Excel Kết Quả

| Cột | Tên | Ý Nghĩa |
|-----|-----|---------|
| 1 | Số điện thoại | Số điện thoại nhập vào |
| 2 | Trạng thái tìm kiếm | "Tìm thấy" / "Không tìm thấy" / "Định dạng sđt không đúng" / hoặc **thông báo lỗi chi tiết từ API** |
| 3 | Tên user | Tên hiển thị của user Zalo |
| 4 | ID user | ID duy nhất của user trên Zalo |
| 5 | Số điện thoại user | Số điện thoại liên kết với tài khoản Zalo |
| 6 | Avatar URL | Đường dẫn ảnh đại diện |
| 7 | Kết quả gửi tin nhắn | "gửi tn thành công" / hoặc **thông báo lỗi chi tiết từ API** |

**Lưu ý:** Các lỗi từ API (rate-limit, timeout, vượt quá request, v.v.) sẽ được ghi chính xác vào Excel thay vì thông báo chung chung.

---

## ⚙️ Các Nút Chức Năng

### Phần Trạng Thái Kết Nối
- **🔄 Làm Mới**: Kiểm tra lại trạng thái server và Zalo

### Phần Quét Mã QR
- **🔄 Tải Lại QR**: Tạo mã QR mới (khi mã cũ hết hạn)

### Phần Xử Lý File Excel
- **📤 Bắt Đầu Xử Lý**: Bắt đầu xử lý file Excel
- **⏸️ Tạm Dừng**: Tạm dừng job đang chạy (chỉ hiện khi job đang running)
- **▶️ Tiếp Tục**: Tiếp tục job đã tạm dừng (chỉ hiện khi job đang paused)
- **❌ Huỷ**: Dừng job và kết thúc (chỉ hiện khi job đang running/paused)
- **❌ Xoá**: Xóa form và làm mới

### Timeout Presets
- **5s**, **10s**, **15s**, **20s**: Thiết lập nhanh timeout

---

## ❌ Xử Lý Lỗi

### **Lỗi: "Zalo service chưa khởi tạo"**
- **Nguyên nhân**: Chưa quét mã QR hoặc quét thất bại
- **Cách khắc phục**: Quét lại mã QR bằng ứng dụng Zalo

### **Lỗi: "Không có file được tải lên"**
- **Nguyên nhân**: Chưa chọn file Excel
- **Cách khắc phục**: Nhấn chọn file Excel hợp lệ

### **Lỗi: "Định dạng sđt không đúng"**
- **Nguyên nhân**: Số điện thoại không đúng định dạng
- **Cách khắc phục**: Sử dụng định dạng `0xxxxxxxxx` (10 chữ số)

### **Gửi tin nhắn thất bại**
- **Nguyên nhân**: Timeout, user chặn, hoặc lỗi mạng
- **Thông tin**: Lỗi chi tiết sẽ được ghi vào Excel (ví dụ: "Không thể nhận tin nhắn từ bạn", "Timeout", v.v.)
- **Cách khắc phục**: Tăng giá trị Timeout hoặc thử lại

### **Lỗi Rate-Limit hoặc "Vượt quá số request cho phép"**
- **Nguyên nhân**: Gửi quá nhiều request trong thời gian ngắn
- **Thông tin**: Lỗi chi tiết sẽ được ghi vào Excel và hiển thị cảnh báo trên UI
- **Cách khắc phục**: 
  - Sử dụng nút **⏸️ Tạm Dừng** để tạm dừng job
  - Đợi một lúc rồi **▶️ Tiếp Tục** hoặc thử lại sau

### **QR code chưa được tạo hoặc hết hạn**
- **Nguyên nhân**: Mã QR hết hạn hoặc server vừa khởi động
- **Cách khắc phục**: Nhấn "🔄 Tải Lại QR"

### **Port đã được sử dụng (EADDRINUSE)**
- **Nguyên nhân**: Port 3000 đã bị chiếm bởi process khác
- **Cách khắc phục**: 
  - Chạy trên port khác: `$env:PORT=3001; npm run dev` (PowerShell) hoặc `PORT=3001 npm run dev` (Linux/Mac)
  - Hoặc kill process đang chiếm port 3000

---

## 🔐 Lưu Ý Quan Trọng

1. **Bảo mật**: 
   - Chỉ sử dụng trên mạng nội bộ hoặc VPN
   - Không chia sẻ file Excel chứa dữ liệu nhạy cảm

2. **Tin nhắn**:
   - Tin nhắn được chọn ngẫu nhiên từ 5 mẫu có sẵn
   - Không thể tùy chỉnh nội dung tin nhắn hiện tại

3. **Tốc độ & Rate Limiting**:
   - Hệ thống sử dụng rate limiting: **15 requests / 60 giây**
   - Concurrency: **1 request tại một thời điểm** (tuần tự)
   - File Excel được ghi real-time mỗi **5 số điện thoại**

4. **File upload**:
   - File gốc được xóa sau khi xử lý xong
   - Chỉ giữ lại file kết quả trong thư mục `uploads/`
   - File kết quả có thể tải về bất cứ lúc nào (real-time)

5. **Kết nối Zalo**:
   - Kết nối sẽ được giữ lại cho đến khi server khởi động lại
   - Quét QR lại nếu kết nối bị mất

6. **Logging**:
   - Mỗi phiên chạy server tạo một file log riêng trong `logs/`
   - Format: `app-<ISO_TIMESTAMP>_pid<PID>.log`
   - Logs chứa thông tin chi tiết về job, errors, và progress

---

## 📁 Cấu Trúc Thư Mục

```
codeToolZl/
├── src/
│   ├── server.js              # Entry point
│   ├── app.js                 # Express app setup
│   ├── config/
│   │   ├── constants.js       # Constants (messages, timeouts, upload dir)
│   │   └── queue.js           # Queue configuration (rate limiting)
│   ├── controllers/
│   │   ├── excel.controller.js    # Excel processing controller
│   │   ├── health.controller.js  # Health check controller
│   │   ├── jobs.controller.js     # Job control controller (pause/resume/cancel)
│   │   ├── uploads.controller.js  # File download controller
│   │   └── zalo.controller.js     # Zalo status & QR controller
│   ├── middleware/
│   │   └── upload.middleware.js   # Multer upload configuration
│   ├── routes/
│   │   ├── index.js           # Main router
│   │   ├── excel.routes.js    # Excel processing routes
│   │   ├── health.routes.js   # Health check routes
│   │   ├── jobs.routes.js     # Job control routes
│   │   ├── uploads.routes.js  # File download routes
│   │   └── zalo.routes.js     # Zalo routes
│   ├── services/
│   │   ├── excel.service.js   # Excel processing logic
│   │   ├── job.service.js     # Job state management
│   │   └── zalo.service.js    # Zalo API service
│   └── utils/
│       ├── file.js            # File utilities
│       ├── logger.js          # Logging utilities
│       ├── phone.js           # Phone number validation
│       ├── random.js          # Random utilities
│       └── sleep.js           # Sleep utility
├── public/
│   └── index.html             # Frontend UI (Alpine.js + Tailwind CSS)
├── uploads/                   # Thư mục lưu file kết quả
├── logs/                      # Thư mục lưu log files
├── package.json               # Thông tin dự án
└── README.md                  # Tài liệu này
```

---

## 🛠️ Troubleshooting

**Vấn đề**: Server không khởi động
```bash
# Kiểm tra port có bị chiếm không
# Windows PowerShell
netstat -ano | findstr :3000

# Thay đổi port nếu cần
$env:PORT=3001; npm run dev
```

**Vấn đề**: Module không tìm thấy
```bash
# Cài đặt lại dependencies
rm -rf node_modules
npm install
```

**Vấn đề**: File Excel bị lỗi
- Kiểm tra định dạng file `.xlsx` không phải `.xls`
- Kiểm tra số điện thoại có phải là text, không phải number
- Đảm bảo cột đầu tiên chứa số điện thoại

**Vấn đề**: Job không pause/resume được
- Kiểm tra job status qua API: `GET /api/jobs/:id`
- Đảm bảo job đang ở trạng thái `running` hoặc `paused`
- Xem log file để kiểm tra chi tiết

**Vấn đề**: File kết quả không tải được
- Kiểm tra thư mục `uploads/` có tồn tại không
- Kiểm tra quyền ghi file
- Xem log file để kiểm tra lỗi

---

## 📞 Hỗ Trợ

Nếu gặp vấn đề:
1. Kiểm tra console browser (F12) để xem lỗi
2. Kiểm tra terminal nơi chạy server
3. Xem log files trong thư mục `logs/`
4. Thử làm mới trang (Ctrl+F5)
5. Thử quét QR lại

---

## 🔄 Changelog

### Version 2.0.0 (Tháng 1, 2026)
- ✅ Refactor codebase thành cấu trúc modular (routes/controllers/services/utils)
- ✅ Thêm job system với pause/resume/cancel
- ✅ Real-time progress tracking (totalPhones, processed, currentPhone)
- ✅ Real-time Excel writing (ghi mỗi 5 số, có thể tải giữa chừng)
- ✅ Warning display cho các lỗi quan trọng
- ✅ Logging system với file log riêng cho mỗi phiên
- ✅ Cải thiện error handling (ghi chính xác lỗi vào Excel)
- ✅ Rate limiting với p-queue (15 requests/60s)
- ✅ UI cải tiến với Alpine.js và Tailwind CSS

### Version 1.0.0
- ✅ Tính năng cơ bản: quét QR, xử lý Excel, gửi tin nhắn

---

**Phiên bản**: 2.0.0  
**Cập nhật lần cuối**: Tháng 1, 2026  
**Trạng thái**: Sử dụng được (Stable)
