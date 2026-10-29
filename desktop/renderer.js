const statusTitles = {
  starting: "Đang khởi động",
  connecting: "Đang kết nối",
  registering: "Đang xác thực Agent",
  online: "Sẵn sàng nhận lệnh in",
  reconnecting: "Đang kết nối lại",
  stopping: "Đang tạm dừng",
  stopped: "Agent đang tạm dừng",
  error: "Cần kiểm tra kết nối",
};

const statusFooters = {
  starting: "Đang chuẩn bị dịch vụ in",
  connecting: "Đang kết nối máy chủ",
  registering: "Máy chủ đang xác thực Agent",
  online: "Kết nối máy chủ ổn định",
  reconnecting: "Agent tự động thử kết nối lại",
  stopping: "Đang kết thúc an toàn",
  stopped: "Máy này hiện không nhận lệnh in",
  error: "Mở nhật ký để xem hướng xử lý",
};

const state = { status: null, logs: [], query: "", startup: null };
const byId = (id) => document.getElementById(id);
const templateLabels = {
  "theory-b-30": "Lý thuyết (30 câu)",
  "theory-c1-35": "Lý thuyết (35 câu)",
  simulation: "Mô phỏng",
};

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function updateStatus(status) {
  state.status = status;
  const phase = status?.phase || "starting";
  byId("status-card").dataset.phase = phase;
  byId("status-title").textContent = statusTitles[phase] || "Đang kiểm tra";
  byId("status-detail").textContent = status?.detail || "Đang kiểm tra trạng thái Agent.";
  byId("status-foot-text").textContent = statusFooters[phase] || "Đang kiểm tra kết nối";
  byId("agent-id").textContent = status?.agentId ? `Agent ${status.agentId}` : "Agent chưa ghép nối";
  byId("machine-name").textContent = status?.machineName || "Máy tính Windows";
  byId("printer-name").textContent = status?.printerName || "Chưa chọn máy in";
  byId("printer-detail").textContent = phase === "online" ? "Đã cấu hình trong Print Agent." : "Máy in Windows nhận lệnh từ Agent này.";
  byId("server-name").textContent = status?.serverUrl ? status.serverUrl.replace(/^https?:\/\//, "") : "Chưa cấu hình máy chủ";
  byId("server-detail").textContent = status?.pid ? `Tiến trình Agent đang chạy · PID ${status.pid}` : "Địa chỉ kết nối của Print Agent.";
  byId("printer-check").textContent = phase === "online" ? "✓" : "·";
  byId("server-check").textContent = phase === "online" ? "✓" : "·";
  byId("reconnect-button").disabled = ["connecting", "registering", "stopping"].includes(phase);
  byId("reconnect-button").querySelector("span").textContent = phase === "stopped" || phase === "error" ? "Khởi động Agent" : "Kết nối lại";
  byId("stop-button").disabled = ["stopped", "stopping"].includes(phase);
}

function renderStartupSetting(startup) {
  state.startup = startup;
  const checkbox = byId("startup-checkbox");
  const detail = byId("startup-setting-detail");
  checkbox.checked = Boolean(startup?.enabled);
  checkbox.disabled = !startup || startup.available === false || Boolean(startup.error) || !startup.exists;

  if (startup?.error) {
    detail.textContent = startup.error;
  } else if (!startup?.exists) {
    detail.textContent = "Chưa có tác vụ. Hãy chạy lại Setup.exe để bật tùy chọn này.";
  } else if (startup.enabled) {
    detail.textContent = "Ứng dụng sẽ tự khởi động khi tài khoản Windows đăng nhập.";
  } else {
    detail.textContent = "Đã tắt. Bạn vẫn có thể mở ứng dụng thủ công khi cần.";
  }
}

function makeLogRow(entry) {
  const row = document.createElement("div");
  row.className = "log-row";
  row.dataset.level = entry.level || "info";

  const main = document.createElement("div");
  main.className = "log-main";
  const marker = document.createElement("span");
  marker.className = "log-marker";
  marker.textContent = entry.level === "error" ? "!" : entry.level === "warning" ? "↻" : entry.level === "success" ? "✓" : "·";
  const text = document.createElement("div");
  text.className = "log-text";
  const message = document.createElement("div");
  message.className = "log-message";
  message.textContent = entry.message || entry.raw || "Hoạt động Agent";
  text.append(message);
  if (entry.detail) {
    const details = document.createElement("details");
    details.className = "log-detail";
    const summary = document.createElement("summary");
    summary.textContent = "Chi tiết kỹ thuật";
    const pre = document.createElement("pre");
    pre.textContent = entry.detail;
    details.append(summary, pre);
    text.append(details);
  }
  main.append(marker, text);
  const time = document.createElement("time");
  time.className = "log-time";
  time.dateTime = entry.timestamp || "";
  time.textContent = formatTime(entry.timestamp);
  row.append(main, time);
  return row;
}

function renderLogs() {
  const list = byId("log-list");
  const query = state.query.trim().toLocaleLowerCase("vi");
  const filtered = state.logs.filter((entry) => !query || `${entry.message} ${entry.detail} ${entry.raw}`.toLocaleLowerCase("vi").includes(query));
  list.replaceChildren(...filtered.slice(-150).map(makeLogRow));
  byId("activity-count").textContent = String(filtered.length);
  byId("empty-state").hidden = filtered.length > 0;
  list.hidden = filtered.length === 0;
  list.scrollTop = list.scrollHeight;
}

function appendLog(entry) {
  state.logs.push(entry);
  if (state.logs.length > 400) state.logs = state.logs.slice(-400);
  renderLogs();
}

byId("reconnect-button").addEventListener("click", async () => {
  const button = byId("reconnect-button");
  button.disabled = true;
  button.querySelector("span").textContent = "Đang kết nối…";
  await window.printAgent.reconnect();
});

byId("stop-button").addEventListener("click", async () => {
  const accepted = window.confirm("Tạm dừng Agent? Máy này sẽ không nhận lệnh in cho đến khi bạn khởi động lại.");
  if (accepted) await window.printAgent.stop();
});

byId("startup-checkbox").addEventListener("change", async (event) => {
  const checkbox = event.currentTarget;
  const enabled = checkbox.checked;
  checkbox.disabled = true;
  try {
    renderStartupSetting(await window.printAgent.setStartupEnabled(enabled));
  } catch (error) {
    checkbox.checked = !enabled;
    checkbox.disabled = false;
    window.alert(error.message || "Không thể cập nhật cấu hình chạy cùng Windows.");
  }
});

async function openLogs() {
  const result = await window.printAgent.openLogs();
  if (result?.error) window.alert(`Không mở được thư mục nhật ký: ${result.error}`);
}

byId("open-logs-button").addEventListener("click", openLogs);
byId("open-logs-shortcut").addEventListener("click", openLogs);
byId("log-search").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderLogs();
});
byId("clear-view-button").addEventListener("click", () => {
  state.logs = [];
  renderLogs();
});

function setPage(page) {
  const isTemplatesPage = page === "templates";
  byId("dashboard-view").hidden = isTemplatesPage;
  byId("templates-view").hidden = !isTemplatesPage;
  byId("page-title").textContent = isTemplatesPage ? "Cấu hình mẫu in" : "Bảng điều khiển";
  byId("nav-dashboard").classList.toggle("active", !isTemplatesPage);
  byId("nav-templates").classList.toggle("active", isTemplatesPage);
  byId("nav-dashboard").toggleAttribute("aria-current", !isTemplatesPage);
  byId("nav-templates").toggleAttribute("aria-current", isTemplatesPage);
  if (isTemplatesPage) void loadTemplates();
}

function showTemplateFeedback(message, level = "success") {
  const feedback = byId("template-feedback");
  feedback.textContent = message;
  feedback.dataset.level = level;
  feedback.hidden = false;
}

function renderTemplates(templates) {
  for (const type of Object.keys(templateLabels)) {
    const template = templates?.[type] || {};
    const stateElement = byId(`${type}-template-state`);
    const chooseButton = document.querySelector(`.template-choose[data-template-type="${type}"]`);
    const resetButton = document.querySelector(`.template-reset[data-template-type="${type}"]`);
    const card = document.querySelector(`.template-card[data-template-type="${type}"]`);
    card.dataset.configured = String(Boolean(template.customAvailable || template.defaultAvailable));
    stateElement.replaceChildren();

    const badge = document.createElement("span");
    const name = document.createElement("span");
    name.className = "template-file-name";
    if (template.customAvailable) {
      badge.className = "template-badge custom";
      badge.textContent = "Mẫu riêng";
      name.textContent = template.fileName || "Mẫu Word đã tải lên";
      chooseButton.textContent = "Thay mẫu Word";
      resetButton.textContent = template.defaultAvailable ? "Dùng mẫu mặc định" : "Bỏ mẫu riêng";
      resetButton.hidden = false;
    } else if (template.defaultAvailable) {
      badge.className = "template-badge default";
      badge.textContent = "Mẫu có sẵn";
      name.textContent = "Đang dùng mẫu đi kèm ứng dụng";
      chooseButton.textContent = "Tải mẫu riêng";
      resetButton.hidden = true;
    } else {
      badge.className = "template-badge missing";
      badge.textContent = "Chưa có mẫu";
      name.textContent = "Tải file Word lên để bật in phần thi này.";
      chooseButton.textContent = "Tải mẫu Word";
      resetButton.hidden = true;
    }
    stateElement.append(badge, name);
  }
}

async function loadTemplates() {
  try {
    renderTemplates(await window.printAgent.getTemplates());
  } catch (error) {
    showTemplateFeedback(`Không đọc được cấu hình mẫu: ${error.message}`, "error");
  }
}

byId("nav-dashboard").addEventListener("click", () => setPage("dashboard"));
byId("nav-templates").addEventListener("click", () => setPage("templates"));
document.querySelectorAll(".template-choose").forEach((button) => {
  button.addEventListener("click", async () => {
    const type = button.dataset.templateType;
    button.disabled = true;
    try {
      const result = await window.printAgent.chooseTemplate(type);
      if (result.canceled) return;
      renderTemplates(result.templates);
      showTemplateFeedback(`Đã lưu mẫu ${templateLabels[type]} trên máy này. Agent sẽ dùng mẫu đó cho các lệnh in tiếp theo.`);
    } catch (error) {
      showTemplateFeedback(error.message || "Không thể lưu mẫu Word.", "error");
    } finally {
      button.disabled = false;
    }
  });
});
document.querySelectorAll(".template-reset").forEach((button) => {
  button.addEventListener("click", async () => {
    const type = button.dataset.templateType;
    const fallback = type === "simulation"
      ? "mẫu Mô phỏng đi kèm ứng dụng"
      : "mẫu mặc định tương ứng nếu bản cài có; nếu không, cần tải mẫu đúng hạng lên trước khi in";
    if (!window.confirm(`Bỏ mẫu ${templateLabels[type]} đang chọn và quay về ${fallback}?`)) return;
    button.disabled = true;
    try {
      renderTemplates(await window.printAgent.resetTemplate(type));
      showTemplateFeedback(`Đã bỏ mẫu riêng cho phần thi ${templateLabels[type]}.`);
    } catch (error) {
      showTemplateFeedback(error.message || "Không thể bỏ mẫu Word.", "error");
    } finally {
      button.disabled = false;
    }
  });
});

window.printAgent.onStatus(updateStatus);
window.printAgent.onStartup(renderStartupSetting);
window.printAgent.onLog(appendLog);
window.printAgent.onHistory((entries) => {
  state.logs = Array.isArray(entries) ? entries : [];
  renderLogs();
});

(async () => {
  const [version, initialState, initialLogs, initialStartup] = await Promise.all([
    window.printAgent.getVersion(),
    window.printAgent.getState(),
    window.printAgent.getLogs(),
    window.printAgent.getStartupState(),
  ]);
  byId("app-version").textContent = `PHIÊN BẢN ${version}`;
  updateStatus(initialState);
  renderStartupSetting(initialStartup);
  state.logs = initialLogs;
  renderLogs();
})();
