# Ghép nối Print Agent bằng Setup.exe

Luồng cài máy mới:

```text
Admin UI tạo Agent
    ↓
Admin UI hiển thị mã ghép nối dùng một lần
    ↓
Chạy ExamPrintAgentSetup.exe trên máy Windows có máy in
    ↓
Setup gọi API đổi mã lấy token, cho chọn printer Windows
    ↓
Setup đăng ký tác vụ chạy trong phiên Windows đang đăng nhập
    ↓
Agent tự đăng ký printer và chuyển Online trên Admin UI
```

## Cấu hình trên Admin UI

1. Tạo Print Room.
2. Tạo Print Agent và gán vào Room.
3. Copy mã ghép nối hiển thị trong hộp thoại.
4. Chép `ExamPrintAgentSetup.exe` vào USB để mang tới máy Windows có máy in.

Mã có thời hạn ngắn và chỉ dùng một lần. Nếu cài lại hoặc chuyển máy, dùng nút tạo mã ghép nối mới. Không cần tạo Printer thủ công nếu Agent có thể đọc danh sách printer Windows; printer sẽ được upsert khi Agent đăng ký.

## Chạy Setup.exe

Chạy bằng quyền Administrator trên máy có máy in. Setup yêu cầu:

- URL API production, ví dụ `https://exam.example.com`;
- mã ghép nối;
- printer Windows cần dùng.

Setup cài Node.js LTS nếu máy chưa có, cài dependency, lưu cấu hình, đăng ký Scheduled Task và mở dashboard HPO Print Agent. Dashboard quản lý tiến trình Node, hiển thị trạng thái và diễn giải nhật ký. Setup đợi server xác nhận Agent đã kết nối rồi mới báo cài đặt hoàn tất. Khi khởi động lại máy, ứng dụng tự chạy sau khi tài khoản Windows này đăng nhập.

Đóng cửa sổ bằng nút X chỉ thu ứng dụng xuống khay; chọn **Thoát** từ biểu tượng Print Agent trong khay để dừng Agent. Nút **Tạm dừng** trong dashboard cũng ngắt kết nối; nút **Kết nối lại** khởi động lại tiến trình Agent do app quản lý. Giữ tài khoản Windows đã cài Agent đăng nhập trong thời gian cần in. Đây là điều kiện để Microsoft Word mở và in được; không cần mở PowerShell hoặc chạy lệnh Node thủ công.

## Đóng gói Setup.exe

Cài Inno Setup 6 trên máy build, sau đó chạy:

```powershell
Set-Location installer
.\build.ps1
```

File tạo ra:

```text
installer\output\ExamPrintAgentSetup.exe
```

Sau khi build, chép file `ExamPrintAgentSetup.exe` vào USB. Admin UI chỉ hiển thị và cho sao chép mã ghép nối; không tải bộ cài qua web.

## Bảo mật

- Server chỉ lưu hash của mã ghép nối và token.
- Không ghi mã ghép nối hoặc token vào log production.
- Không commit `config.json` của Agent.
- Rotate token chỉ dùng cho sự cố hoặc thay thế máy; không cần làm trong mỗi ca thi.
