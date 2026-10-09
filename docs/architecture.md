# Kiến trúc và luồng hoạt động của HPO Print Agent

Tài liệu này mô tả repository `PRINT.AGENT`: ứng dụng Windows chạy trên máy kết nối với máy in. Quản lý phòng, agent, campaign và hàng đợi thuộc `EXAM.SERVER`/`EXAM.ADMIN.HPO`, không thuộc repository này.

## 1. Tổng quan

```text
EXAM.ADMIN.HPO
    │ cấu hình phòng, agent, máy in, campaign; xem trạng thái/job
    ▼
EXAM.SERVER ───── Socket.IO ─────► HPO Print Agent (ứng dụng Windows)
    │                                  │
    │ cấp payload job                  ├─ điền dữ liệu vào mẫu DOCX
    │ nhận trạng thái job              └─ Microsoft Word → Windows printer driver
    ▼
MongoDB / các dịch vụ phía server
```

Print Agent không kết nối trực tiếp MongoDB hoặc Redis. Agent giao tiếp với SERVER qua Socket.IO và tải dữ liệu job qua API có xác thực. ADMIN dùng SERVER để quản lý và theo dõi; ADMIN không gửi lệnh trực tiếp tới máy in.

## 2. Các thành phần trong repository

| Thành phần | Vai trò |
| --- | --- |
| `desktop/main.mjs` | Tiến trình chính Electron: tạo cửa sổ/khay hệ thống, quản lý tiến trình agent và mẫu Word cục bộ. |
| `desktop/preload.cjs`, `desktop/renderer.js`, `desktop/index.html`, `desktop/styles.css` | Cầu IPC và giao diện desktop: trạng thái, thao tác kết nối, log, cấu hình mẫu. |
| `desktop/agent-log.js` | Chuyển log kỹ thuật thành nội dung dễ đọc trên giao diện. |
| `index.js` | Tiến trình Print Agent: đăng ký với SERVER, heartbeat, nhận và xử lý print job. |
| `runtime-constants.js` | Tên sự kiện Socket.IO và thời gian heartbeat/reconnect. |
| `wordPrintRenderer.js` | Đọc mẫu DOCX, thay placeholder bằng dữ liệu, xử lý ảnh và tạo DOCX tạm. |
| `print-docx.ps1` | Mở Word ở chế độ nền, chọn máy in Windows và gửi lệnh in. |
| `setup.ps1`, `install-agent-task.ps1` | Ghép nối lần đầu, ghi cấu hình và tạo Scheduled Task chạy app khi tài khoản Windows đăng nhập. |
| `installer/` | Cấu hình và script đóng gói bộ cài Windows. |
| `templates/` | Mẫu Word mặc định được đóng gói cùng ứng dụng (nếu có trong bản build). |
| `test/` | Kiểm thử renderer DOCX và cách trình bày log. |

## 3. Ghép nối và kết nối

1. Quản trị viên tạo Print Room và Print Agent ở ADMIN, sau đó tạo mã ghép nối dùng một lần.
2. Setup trên máy Windows gửi mã ghép nối, tên máy và phiên bản agent tới API ghép nối của SERVER. SERVER trả về `agentId` và token.
3. Setup ghi `serverUrl`, `agentId`, `agentToken`, máy in được chọn và các đường dẫn runtime vào `config.json` trong thư mục cài đặt. Token là bí mật; không đưa `config.json` thật vào Git hoặc log.
4. Electron khởi chạy `index.js` như tiến trình con. Agent kết nối Socket.IO namespace `/print-agents`, dùng socket path `/device` (có thể cấu hình) và xác thực bằng token.
5. Khi socket kết nối, Agent gửi sự kiện `PrintAgentRegister`, gồm mã agent, tên máy Windows, phiên bản, máy in mặc định và danh sách máy in phát hiện qua `Get-Printer`.
6. Agent gửi `PrintAgentHeartbeat` mỗi 15 giây và tự kết nối lại khi socket bị ngắt (retry từ 1 đến tối đa 30 giây).

### Trạng thái ở ứng dụng và ADMIN

- **Ứng dụng desktop** báo tiến trình agent cục bộ đang chạy hay đã dừng; đây là trạng thái quản lý tiến trình trên máy.
- **ADMIN** hiển thị trạng thái do SERVER suy ra từ đăng ký/heartbeat gần nhất. Hai nơi có thể lệch tạm thời khi vừa reconnect, mất mạng hoặc heartbeat chưa hết hạn.
- Log `connected` nghĩa là socket đã kết nối; log `registered` kèm xác nhận thành công nghĩa là SERVER đã nhận đăng ký. Chỉ thấy cửa sổ ứng dụng mở chưa chứng minh agent đang kết nối.

## 4. Luồng xử lý một lệnh in

```text
SERVER gửi PrintJobAvailable
  → Agent xác nhận PrintJobAccepted
  → tải payload của job bằng Bearer token
  → chọn mẫu theo templateType và tạo DOCX tạm
  → báo PrintJobProgress = printing
  → gọi PowerShell/Word để in
  → báo PrintJobCompleted hoặc PrintJobFailed
  → xóa DOCX tạm
```

1. SERVER quyết định job đủ điều kiện và gửi thông báo tới agent được định tuyến. Agent không tự truy vấn database hoặc tự tạo danh sách bài thi cần in.
2. Agent bỏ qua thông báo trùng `jobId` đang được xử lý, rồi gửi xác nhận đã nhận.
3. Agent tải payload từ `payloadEndpoint` với token của agent. Payload chứa loại mẫu (`theory` hoặc `simulation`) và dữ liệu cần điền.
4. `wordPrintRenderer.js` ưu tiên mẫu riêng theo tài khoản Windows hiện tại tại `%APPDATA%\HPO Print Agent\templates`. Lý thuyết dùng `theory-b-30.docx` cho hạng B (cả số sàn/tự động), hoặc `theory-c1-35.docx` cho hạng C1; Mô phỏng dùng `simulation.docx`. Hạng được chốt trên SERVER từ hồ sơ học viên và gửi kèm job. Nếu thiếu đúng mẫu của hạng, job thất bại thay vì âm thầm dùng form có số câu không phù hợp.
5. Placeholder trong mẫu dùng cú pháp `{{ten_truong}}`. Với mẫu mô phỏng, ảnh base64 được xử lý và chèn vào DOCX; với mẫu lý thuyết, một số ngày/giờ được định dạng theo múi giờ Việt Nam.
6. Agent báo trạng thái đang in, sau đó gọi `print-docx.ps1`. Script dùng Microsoft Word COM để mở DOCX ẩn và gửi lệnh in tới máy in Windows. Số bản được giới hạn từ 1 đến 10.
7. Nếu thành công, agent phát `PrintJobCompleted`; nếu lỗi tải dữ liệu, render hoặc Word/máy in, agent phát `PrintJobFailed` kèm mã lỗi/thông báo. File DOCX tạm được xóa sau khi xử lý.

> Agent chỉ xác nhận đã gọi Word/spooler thành công; điều đó không đảm bảo giấy đã ra khỏi máy in. Nếu job báo thành công nhưng không có bản in vật lý, cần kiểm tra hàng đợi Windows, trạng thái máy in và giấy/mực.

> Agent chống xử lý trùng cùng một `jobId` trong tiến trình hiện tại, nhưng không phải hàng đợi bền vững riêng. Điều phối, retry và thứ tự hàng đợi thuộc SERVER; cần xem repository SERVER để biết chính xác chính sách phát job.

## 5. Mẫu Word

- Mẫu do người dùng chọn trong tab cấu hình của desktop app được lưu cục bộ dưới `%APPDATA%\HPO Print Agent\templates`; chúng không được tải lên SERVER.
- Mẫu riêng ghi đè mẫu mặc định cùng loại. Hai mẫu Lý thuyết là độc lập; thay mẫu B không ghi đè mẫu C1 và ngược lại. Khôi phục/xóa mẫu riêng sẽ đưa agent về mẫu mặc định đã đóng gói, nếu bản build có mẫu đó.
- Mẫu phải giữ nguyên tên placeholder mà dữ liệu job cung cấp. Thay đổi cấu trúc/placeholder có thể khiến render job lỗi.
- Nếu muốn bản cài có mẫu mặc định, phải đóng gói đúng từng biến thể Lý thuyết (`theory-b-30-result.docx`, `theory-c1-35-result.docx`) và mẫu Mô phỏng. Không đưa dữ liệu thí sinh thật vào mẫu hoặc repository.

## 6. Chạy nền, log và vận hành

- Setup đăng ký Scheduled Task `ExamPrintAgent` chạy ứng dụng trong phiên tương tác của tài khoản Windows khi đăng nhập. App có thể thu xuống system tray; chọn **Thoát** hoặc **Tạm dừng** sẽ dừng agent.
- Máy cần duy trì phiên đăng nhập Windows để Microsoft Word COM hoạt động ổn định; đây không phải Windows Service chạy trong phiên không có người dùng.
- Dashboard cho phép xem log và mở thư mục log. Log agent mặc định nằm tại `C:\ProgramData\ExamPrintAgent\logs\agent.log`.
- Khi kiểm tra sự cố, đối chiếu trạng thái tiến trình trong app, log `connected`/`registered`/heartbeat, trạng thái agent ở ADMIN, log job và hàng đợi in Windows.
- In cần Windows đã cài driver máy in và Microsoft Word. Agent online không tự xác nhận Word/máy in đang sẵn sàng.

## 7. Cấu hình và bảo mật

`config.example.json` chỉ là ví dụ cấu trúc. Các trường thường dùng gồm `serverUrl`, `socketPath`, `agentId`, `agentToken`, `printerName`, `nodePath`, `serviceVersion`, `tempDirectory` và `logDirectory`.

- `config.json` trên máy đã cài chứa token thật, không commit hoặc chia sẻ công khai.
- Mã ghép nối chỉ dùng một lần; nếu token bị thu hồi hoặc cần cài trên máy khác, tạo mã mới trên ADMIN.
- Chỉ tải Setup.exe từ nguồn nội bộ đáng tin cậy; giữ quyền truy cập thư mục cấu hình/log phù hợp chính sách công ty.
- Agent cần truy cập mạng tới SERVER qua HTTPS/WSS; không cần thông tin kết nối MongoDB/Redis.

## 8. Kiểm thử và build

Tại thư mục gốc repository:

```powershell
npm ci
npm test
npm run app
npm run build:installer
```

`npm run app` mở desktop app khi đã cài dependency và có cấu hình hợp lệ. Build installer cần Node.js LTS và Inno Setup 6; Setup.exe được tạo tại `installer/output/ExamPrintAgentSetup.exe`. Xem [installation.md](installation.md), [pairing.md](pairing.md) và [README.md](../README.md) để biết hướng dẫn cài đặt, ghép nối và build.
