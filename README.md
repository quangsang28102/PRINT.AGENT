# HPO Print Agent

Ứng dụng Windows kết nối EXAM.SERVER, điền dữ liệu vào mẫu Word cục bộ và gửi lệnh in qua Microsoft Word trong phiên người dùng đang đăng nhập.

## Thành phần

- **Dashboard Electron**: giao diện vận hành, khay hệ thống, trạng thái kết nối và nhật ký dễ đọc.
- **Print Agent Node.js**: kết nối Socket.IO, nhận job, render DOCX và in bằng Word.
- **Setup.exe**: cài app, ghép nối Agent, chọn máy in và đăng ký tự khởi động khi Windows đăng nhập.

EXAM.SERVER quản lý room, Agent, máy in, hàng đợi và API. EXAM.ADMIN.HPO quản lý giao diện quản trị. Repo này chỉ phụ trách app Windows và bộ cài.

## Build bộ cài

Máy build cần Node.js LTS và Inno Setup 6. Máy dùng để in cần Windows, Microsoft Word và máy in đã cài driver.

```powershell
npm ci
npm test
npm run build:installer
```

Bộ cài nằm tại `installer/output/ExamPrintAgentSetup.exe`. Chép file này vào USB; chạy bằng quyền Administrator trên máy cần in. Setup sẽ hỏi URL API production, mã ghép nối và máy in.

Setup tự tạo biểu tượng HPO Print Agent trên Desktop và Start Menu.

Tab **Cấu hình mẫu in** cho phép chọn DOCX riêng cho Lý thuyết hạng B (30 câu), Lý thuyết hạng C1 (35 câu) và Mô phỏng. Agent chọn mẫu lý thuyết theo hạng trong hồ sơ học viên. Các mẫu được lưu trong `%APPDATA%\HPO Print Agent\templates`, không bị bộ cài ghi đè và không gửi lên SERVER.

## Sử dụng

Dashboard cho biết Agent đã kết nối, đang kết nối lại hay đang tạm dừng. Nhật ký hiển thị nội dung tiếng Việt; có thể mở chi tiết kỹ thuật khi cần hỗ trợ. Nút **Kết nối lại** khởi động lại tiến trình Agent do app quản lý. Nút **Tạm dừng** ngắt Agent; đóng cửa sổ bằng X chỉ thu app xuống khay hệ thống.

Giữ tài khoản Windows đăng nhập trong thời gian cần in. App tự chạy lại khi người dùng đăng nhập. Xem [hướng dẫn cài đặt](docs/installation.md) và [ghép nối](docs/pairing.md).

## Kiểm tra và bảo mật

```powershell
npm test
node --check .\index.js
```

Không commit `config.json` vì file này chứa token Agent.
