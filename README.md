# NGSI · Phòng Kỹ thuật – Quản trị công việc và nguồn lực

Ứng dụng web nội bộ: Dashboard, Tổng quan dự án, Tải tuần, Nhập theo tuần, Kế hoạch dự án, Cài đặt.
Node.js + Express + MariaDB (hoặc SQLite cho máy lập trình), đăng nhập theo tài khoản, cập nhật tức thời.

**Triển khai lên máy chủ:** `HUONG-DAN-TRIEN-KHAI.md`  ·  **Chuyển SQLite → MariaDB:** `HUONG-DAN-CHUYEN-MARIADB.md`  ·  **Sửa giao diện / viết module mới:** `HUONG-DAN-PHAT-TRIEN.md`  ·  Ngữ cảnh cho Claude Code: `CLAUDE.md`

Chạy nhanh trên máy phát triển:
```bash
npm install
cp .env.example .env      # sửa JWT_SECRET, đặt DB_CLIENT=sqlite và DATA_DIR=./data (không cần cài MariaDB)
npm run user -- create    # tạo tài khoản trưởng phòng
npm run dev               # mở http://127.0.0.1:3000 (tự khởi động lại khi sửa server.js)
```
