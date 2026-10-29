# Cài đặt và gỡ cài đặt Exam Print Agent

Tài liệu này hướng dẫn cài `Print Agent` trên máy Windows có kết nối máy in, đăng ký Agent với API Server, chạy thử, cài tác vụ tự khởi động và gỡ cài đặt.

Print Agent chỉ kết nối tới API Server qua Socket.IO. Agent không truy cập MongoDB hoặc Redis.

## 1. Kiến trúc thư mục khuyến nghị

Đặt thư mục agent tại:

```text
C:\ExamPrintAgent\
├── config.json
├── config.example.json
├── index.js
├── runtime-constants.js
├── wordPrintRenderer.js
├── print-docx.ps1
├── templates\
├── install-agent-task.ps1
├── desktop\
│   ├── main.mjs
│   ├── preload.cjs
│   └── renderer.js
├── package.json
└── node_modules\
```

Không commit `config.json` vì file này chứa token Print Agent.

## 2. Điều kiện cần

- Windows account có quyền Administrator để cài hoặc gỡ Agent.
- Node.js có tại `C:\Program Files\nodejs\node.exe`, hoặc biết chính xác đường dẫn `node.exe`.
- Máy in đã được cài trong Windows và in thử thành công.
- Microsoft Word đã được cài và có thể khởi động trên máy Windows.
- Máy Windows truy cập được `serverUrl` của API Server.
- Một Print Agent đã được tạo trong trang quản trị hoặc qua API.

## 3. Tạo phòng, agent và lấy token

Thứ tự cấu hình phía quản trị:

1. Tạo **phòng in**.
2. Tạo **Print Agent**, chọn phòng và ghi lại token được trả về.
3. Khai báo hoặc chờ agent tự discovery máy in.
4. Đặt một printer của agent làm printer mặc định.
5. Gán phòng in cho Exam trước khi tạo campaign.

Token chỉ được trả về khi tạo agent hoặc rotate token. Nếu mất token, dùng rotate token để cấp token mới; token cũ sẽ không còn hợp lệ.

API tạo agent:

```http
POST /api/v1/print-jobs/agents
Authorization: Bearer <adminAccessToken>
Content-Type: application/json
```

```json
{
  "agentId": "ROOM01-PRINT01",
  "name": "Agent phòng 01",
  "roomId": "<roomObjectId>",
  "machineName": "PC-ROOM-01"
}
```

Lưu `data.token` trong response. Không ghi token vào log hoặc gửi token qua kênh không an toàn.

## 4. Cài đặt bằng Setup.exe

Dùng `ExamPrintAgentSetup.exe` từ USB cho quy trình cài đặt. Chạy Setup bằng quyền Administrator, nhập URL API và mã ghép nối, rồi chọn máy in. Setup cài dependency, lưu config, đăng ký Scheduled Task `ExamPrintAgent`, tạo lối tắt HPO Print Agent trên Desktop và Start Menu, rồi mở dashboard. Dashboard quản lý trực tiếp tiến trình Node Agent; trạng thái không dựa vào việc đọc command line của tiến trình Windows.

Setup đợi tối đa 45 giây để server xác nhận Agent đã kết nối. Khi thành công, Agent sẽ hiện Online trong Admin. Nút **Kết nối lại** khởi động lại Agent; nút **Tạm dừng** ngắt kết nối. Đóng nút X chỉ thu ứng dụng xuống khay; chọn **Thoát** trong menu khay sẽ dừng Agent. Checkbox **Chạy cùng Windows** trong dashboard cho phép bật hoặc tắt Scheduled Task tự khởi động khi tài khoản Windows đăng nhập. Việc tắt checkbox chỉ áp dụng cho lần đăng nhập tiếp theo, không dừng phiên Agent hiện tại. Tài khoản Windows cần tiếp tục đăng nhập để Microsoft Word có thể in.

Trong tab **Cấu hình mẫu in**, tải riêng ba file `.docx`: mẫu Lý thuyết 30 câu, mẫu Lý thuyết 35 câu và Mô phỏng. Agent chọn mẫu Lý thuyết theo số câu trong kết quả: tối đa 30 câu dùng mẫu 30 câu; trên 30 câu dùng mẫu 35 câu, không phụ thuộc hạng khai báo trong hồ sơ. Mẫu riêng lưu tại `%APPDATA%\HPO Print Agent\templates`, tách khỏi thư mục cài đặt để không bị bộ cài hoặc bản cập nhật ghi đè. Nếu bỏ mẫu riêng, Agent chỉ dùng được mẫu mặc định tương ứng nếu bản cài có; thiếu mẫu theo số câu thì job báo lỗi thay vì in sai form. File Word phải giữ đúng các placeholder mà dữ liệu bài thi sử dụng. Mẫu được lưu theo tài khoản Windows, không tải lên SERVER.

Không cần chạy lệnh cài Agent trực tiếp trong PowerShell. Nhật ký hoạt động được giải thích bằng tiếng Việt trong dashboard; chi tiết kỹ thuật và file đầy đủ có tại `C:\ProgramData\ExamPrintAgent\logs\agent.log`.

Kiểm tra tác vụ và log khi xử lý sự cố:

```powershell
Get-ScheduledTask -TaskName ExamPrintAgent
Get-ScheduledTaskInfo -TaskName ExamPrintAgent
Get-Content C:\ProgramData\ExamPrintAgent\logs\agent.log -Tail 80
```

Các lỗi thường gặp:

| Dấu hiệu | Nguyên nhân cần kiểm tra |
|---|---|
| Agent offline | Scheduled Task, `serverUrl`, firewall, token, `agentId` hoặc tài khoản Windows chưa đăng nhập |
| Không thấy máy in | Máy in chưa cài hoặc tài khoản Windows chưa có quyền truy cập |
| Tải dữ liệu form lỗi | API Server không truy cập được hoặc token đã revoke/rotate |
| In lỗi | Tên máy in Windows không khớp `windowsName` |

## 5. Cập nhật Agent

Chạy Setup.exe phiên bản mới để cập nhật Agent và Scheduled Task. Nếu tìm thấy cấu hình cũ, Setup cho phép nhấn Enter để dùng lại token trên máy này hoặc nhập mã ghép nối mới để thay token (ví dụ Agent cũ đã bị thu hồi/xóa trên server). Khi cài sang máy khác, hãy tạo mã ghép nối mới trên Admin.

Khi rotate token trên admin, cập nhật `agentToken` trong `config.json` rồi chạy:

```powershell
Start-ScheduledTask -TaskName ExamPrintAgent
```

## 6. Gỡ cài đặt

### 6.1. Thu hồi agent trên server

Trước khi xóa file trên máy Windows, vào Admin → **Vận hành in → Cấu hình** và thu hồi/vô hiệu hóa agent.

Hoặc gọi API:

```http
POST /api/v1/print-jobs/agents/<agentObjectId>/revoke
Authorization: Bearer <adminAccessToken>
```

Việc này ngăn token hiện tại kết nối lại server.

### 6.2. Dừng và xóa Scheduled Task

Mở PowerShell bằng Administrator:

```powershell
Stop-ScheduledTask -TaskName ExamPrintAgent -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName ExamPrintAgent -Confirm:$false
```

Kiểm tra:

```powershell
Get-ScheduledTask -TaskName ExamPrintAgent -ErrorAction SilentlyContinue
```

Có thể chạy nhanh bằng cách mở PowerShell Administrator tại thư mục agent và chạy:

```powershell
.\uninstall-agent.ps1
```

Hoặc double-click `uninstall-agent.bat`. File `.bat` sẽ gọi PowerShell với `ExecutionPolicy Bypass`, nhưng vẫn yêu cầu quyền Administrator. Script luôn hỏi xác nhận trước khi xóa thư mục Agent.

Nếu muốn chỉ xóa tác vụ và giữ lại source/config/log:

```powershell
.\uninstall-agent.ps1 -RemoveFiles:$false
```

Nếu muốn chỉ định thư mục cài đặt khác:

```powershell
.\uninstall-agent.ps1 -AgentDirectory 'D:\ExamPrintAgent'
```

Script cũng xóa service cũ nếu còn tồn tại. Với `-RemoveFiles:$false`, source, dependency, config, log và DOCX tạm được giữ nguyên.

### 6.3. Xóa file và dữ liệu tạm

Chỉ chạy sau khi Scheduled Task đã được dừng và xóa:

```powershell
Remove-Item -LiteralPath "C:\ExamPrintAgent" -Recurse -Force
```

Nếu đã dùng thư mục khác, thay bằng đúng đường dẫn cài đặt. Kiểm tra thêm `tempDirectory` và `logDirectory` trong `config.json` nếu chúng nằm ngoài `C:\ExamPrintAgent`.

### 6.4. Nếu agent chỉ chạy foreground

Nếu Agent được chạy bằng `node .\index.js` ở foreground:

1. Quay lại cửa sổ terminal đang chạy agent.
2. Nhấn `Ctrl+C`.
3. Thu hồi agent trên server.
4. Xóa thư mục cài đặt nếu không còn dùng.

Trường hợp này không cần gỡ Scheduled Task nếu chưa cài Setup.exe.

## 7. Checklist hoàn tất

- [ ] Agent đã được revoke hoặc deactivate trên server.
- [ ] Scheduled Task `ExamPrintAgent` đã dừng.
- [ ] Scheduled Task `ExamPrintAgent` đã bị xóa.
- [ ] Không còn process `node.exe` của agent.
- [ ] Đã xóa `config.json`, token, `node_modules`, log và thư mục tạm nếu cần.
- [ ] Printer Windows vẫn được giữ lại nếu máy còn dùng cho mục đích khác.
