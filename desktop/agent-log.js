const formatDetail = (value) => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value, null, 2);
};

export function parseAgentLogLine(line) {
  const match = String(line).match(/^(?<timestamp>\S+)\s+(?<event>[a-z_]+)(?:\s+(?<payload>.*))?$/i);
  if (!match) return null;

  const { timestamp, event, payload = "" } = match.groups;
  if (!Number.isFinite(Date.parse(timestamp))) return null;
  let data = payload;
  try {
    if (payload.startsWith("{") || payload.startsWith("[")) data = JSON.parse(payload);
  } catch {
    data = payload;
  }

  let level = "info";
  let message = "Agent ghi nhận một hoạt động.";
  let detail = formatDetail(data);

  switch (event) {
    case "starting":
      message = "Agent đang khởi động.";
      detail = typeof data === "object" ? formatDetail(data) : payload;
      break;
    case "connected":
      level = "success";
      message = "Đã kết nối tới máy chủ; đang xác thực Agent.";
      detail = "";
      break;
    case "registered":
      if (data?.ok) {
        level = "success";
        message = "Máy chủ đã xác nhận Agent hoạt động.";
      } else {
        level = "error";
        message = `Máy chủ từ chối Agent${data?.message ? `: ${data.message}` : "."}`;
      }
      detail = formatDetail(data);
      break;
    case "connect_error":
      level = "error";
      message = `Không kết nối được máy chủ: ${payload || "không rõ nguyên nhân"}`;
      break;
    case "disconnected":
      level = "warning";
      message = `Mất kết nối máy chủ (${payload || "không rõ nguyên nhân"}). Agent sẽ tự thử lại.`;
      break;
    case "printer_discovery_fallback":
      level = "success";
      message = `Đã kiểm tra danh sách máy in Windows${data?.count != null ? ` (${data.count} máy)` : ""}.`;
      detail = formatDetail(data);
      break;
    case "printer_discovery_fallback_failed":
      level = "warning";
      message = `Không đọc được danh sách máy in Windows: ${payload || "không rõ nguyên nhân"}`;
      break;
    case "printed":
      level = "success";
      message = "Đã gửi lệnh in thành công.";
      detail = `Mã tác vụ: ${payload}`;
      break;
    case "failed":
      level = "error";
      if (typeof data === "object" && data !== null) {
        message = `In thất bại${data.message ? `: ${data.message}` : "."}`;
        detail = formatDetail(data);
      } else {
        message = `In thất bại: ${payload || "không rõ nguyên nhân"}`;
      }
      break;
    case "stopping":
      level = "warning";
      message = "Agent đang dừng an toàn.";
      detail = "";
      break;
    default:
      message = `${event}: ${payload}`.trim();
  }

  return { timestamp, event, level, message, detail, raw: line };
}
