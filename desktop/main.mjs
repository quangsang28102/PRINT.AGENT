import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron/main";
import { fork } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import { parseAgentLogLine } from "./agent-log.js";

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const developmentRoot = path.resolve(desktopDirectory, "..");
const installDirectory = app.isPackaged ? path.dirname(app.getPath("exe")) : developmentRoot;
const configPath = path.join(installDirectory, "config.json");
const agentEntryPath = path.join(installDirectory, "index.js");
const templateTypes = {
  theory: { label: "Lý thuyết", fileName: "theory.docx", defaultFileName: "theory-result.docx" },
  simulation: { label: "Mô phỏng", fileName: "simulation.docx", defaultFileName: "simulation-result.docx" },
};
const singleInstance = app.requestSingleInstanceLock();

if (!singleInstance) {
  app.quit();
} else {
  app.setName("HPO Print Agent");
  if (process.platform === "win32") app.setAppUserModelId("vn.hpo.exam.print-agent");
  Menu.setApplicationMenu(null);

  let mainWindow;
  let tray;
  let config;
  let customTemplateDirectory;
  let templateMetadataPath;
  let agentProcess;
  let quitting = false;
  let stoppingForRestart = false;
  let logBuffer = [];
  let stdoutRemainder = "";
  let status = {
    phase: "starting",
    detail: "Đang chuẩn bị Print Agent.",
    agentId: "",
    printerName: "",
    serverUrl: "",
    machineName: process.env.COMPUTERNAME || "Máy tính Windows",
    pid: null,
    startedAt: null,
  };

  function broadcast(channel, data) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, data);
    }
  }

  function updateStatus(phase, detail) {
    status = {
      ...status,
      phase,
      detail,
      pid: agentProcess?.pid ?? null,
    };
    broadcast("agent:status", status);
    updateTray();
  }

  function appendLog(entry) {
    if (!entry) return;
    logBuffer.push(entry);
    if (logBuffer.length > 400) logBuffer = logBuffer.slice(-400);
    broadcast("agent:log", entry);
  }

  function updateTray() {
    if (!tray || tray.isDestroyed()) return;
    const labels = {
      online: "Đang hoạt động",
      connecting: "Đang kết nối",
      registering: "Đang xác thực",
      reconnecting: "Đang kết nối lại",
      stopping: "Đang dừng",
      stopped: "Đã tạm dừng",
      error: "Cần kiểm tra",
    };
    tray.setToolTip(`HPO Print Agent — ${labels[status.phase] || "Đang khởi động"}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `Trạng thái: ${labels[status.phase] || "Đang khởi động"}`, enabled: false },
      { type: "separator" },
      { label: "Mở bảng điều khiển", click: showWindow },
      { label: "Kết nối lại", click: reconnectAgent },
      { label: "Tạm dừng Agent", click: stopAgent },
      { type: "separator" },
      { label: "Thoát", click: () => app.quit() },
    ]));
  }

  function applyAgentEvent(entry) {
    switch (entry.event) {
      case "starting":
        updateStatus("connecting", "Agent đang khởi động và chuẩn bị kết nối.");
        break;
      case "connected":
        updateStatus("registering", "Đã tới máy chủ. Đang xác thực Agent.");
        break;
      case "registered": {
        let ack;
        try { ack = JSON.parse(entry.raw.slice(entry.raw.indexOf("registered") + "registered".length).trim()); } catch { ack = null; }
        if (ack?.ok) {
          status.lastConnectedAt = new Date().toISOString();
          updateStatus("online", "Agent đã được máy chủ xác nhận. Có thể nhận lệnh in.");
        } else {
          updateStatus("error", ack?.message || "Máy chủ chưa xác nhận Agent. Mở nhật ký để xem chi tiết.");
        }
        break;
      }
      case "connect_error":
        updateStatus("reconnecting", "Chưa kết nối được máy chủ. Agent đang tự thử lại.");
        break;
      case "disconnected":
        updateStatus("reconnecting", "Kết nối tới máy chủ bị ngắt. Agent đang tự kết nối lại.");
        break;
      case "stopping":
        updateStatus("stopping", "Đang dừng Agent an toàn.");
        break;
      default:
        break;
    }
  }

  function handleOutputLine(line) {
    const entry = parseAgentLogLine(line);
    if (!entry) {
      if (line.trim()) appendLog({ timestamp: new Date().toISOString(), event: "output", level: "info", message: line.trim(), detail: "", raw: line });
      return;
    }
    appendLog(entry);
    applyAgentEvent(entry);
  }

  async function loadRecentLogs() {
    try {
      const logPath = path.join(config.logDirectory, "agent.log");
      const contents = await fs.readFile(logPath, "utf8");
      logBuffer = contents.split(/\r?\n/).filter(Boolean).slice(-200).map(parseAgentLogLine).filter(Boolean);
    } catch {
      logBuffer = [];
    }
  }

  function getTemplateDefinition(type) {
    const definition = templateTypes[type];
    if (!definition) throw new Error("Loại mẫu không hợp lệ.");
    return definition;
  }

  async function readTemplateMetadata() {
    try {
      return JSON.parse(await fs.readFile(templateMetadataPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  async function writeTemplateMetadata(metadata) {
    const temporaryPath = `${templateMetadataPath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(metadata, null, 2), "utf8");
    await fs.rename(temporaryPath, templateMetadataPath);
  }

  async function getTemplateStatuses() {
    await fs.mkdir(customTemplateDirectory, { recursive: true });
    const metadata = await readTemplateMetadata();
    const statuses = {};
    for (const [type, definition] of Object.entries(templateTypes)) {
      let customAvailable = false;
      let defaultAvailable = false;
      try {
        await fs.access(path.join(customTemplateDirectory, definition.fileName));
        customAvailable = true;
      } catch { }
      try {
        await fs.access(path.join(installDirectory, "templates", type, definition.defaultFileName));
        defaultAvailable = true;
      } catch { }
      statuses[type] = {
        label: definition.label,
        customAvailable,
        defaultAvailable,
        fileName: customAvailable ? metadata[type]?.fileName || definition.fileName : "",
      };
    }
    return statuses;
  }

  async function chooseTemplate(type) {
    const definition = getTemplateDefinition(type);
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: `Chọn mẫu Word cho phần thi ${definition.label}`,
      properties: ["openFile"],
      filters: [{ name: "Tài liệu Word (.docx)", extensions: ["docx"] }],
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };

    const sourcePath = selection.filePaths[0];
    if (path.extname(sourcePath).toLowerCase() !== ".docx") throw new Error("Vui lòng chọn file Word có định dạng .docx.");
    let zip;
    try {
      zip = new PizZip(await fs.readFile(sourcePath));
    } catch {
      throw new Error("File này không phải tài liệu .docx hợp lệ hoặc đang bị lỗi.");
    }
    if (!zip.file("word/document.xml")) throw new Error("Không tìm thấy nội dung Word trong file. Hãy chọn một tài liệu .docx hợp lệ.");

    await fs.mkdir(customTemplateDirectory, { recursive: true });
    const destinationPath = path.join(customTemplateDirectory, definition.fileName);
    const temporaryPath = `${destinationPath}.tmp`;
    try {
      await fs.copyFile(sourcePath, temporaryPath);
      await fs.rename(temporaryPath, destinationPath);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
    }

    const metadata = await readTemplateMetadata();
    metadata[type] = { fileName: path.basename(sourcePath), updatedAt: new Date().toISOString() };
    await writeTemplateMetadata(metadata);
    return { canceled: false, templates: await getTemplateStatuses() };
  }

  async function resetTemplate(type) {
    const definition = getTemplateDefinition(type);
    await fs.rm(path.join(customTemplateDirectory, definition.fileName), { force: true });
    const metadata = await readTemplateMetadata();
    delete metadata[type];
    await writeTemplateMetadata(metadata);
    return getTemplateStatuses();
  }

  async function loadConfig() {
    const raw = await fs.readFile(configPath, "utf8");
    config = JSON.parse(raw);
    if (!config.agentId || !config.agentToken || !config.serverUrl || !config.nodePath) {
      throw new Error("Thiếu thông tin cài đặt Agent. Hãy chạy lại bộ cài để ghép nối.");
    }
    status = {
      ...status,
      agentId: config.agentId,
      printerName: config.printerName || "Chưa chọn máy in",
      serverUrl: config.serverUrl,
    };
    await fs.mkdir(config.logDirectory, { recursive: true });
    await loadRecentLogs();
  }

  function startAgent() {
    if (agentProcess && agentProcess.exitCode === null) {
      return { started: false, alreadyRunning: true };
    }
    if (!config?.nodePath || !config?.agentId) {
      updateStatus("error", "Chưa có cấu hình Agent. Hãy chạy lại bộ cài và ghép nối.");
      return { started: false, error: status.detail };
    }

    stdoutRemainder = "";
    status.startedAt = new Date().toISOString();
    updateStatus("connecting", "Đang khởi động tiến trình in.");
    try {
      agentProcess = fork(agentEntryPath, [], {
        cwd: installDirectory,
        execPath: config.nodePath,
        env: {
          ...process.env,
          PRINT_AGENT_CONFIG: configPath,
          PRINT_AGENT_TEMPLATE_DIRECTORY: customTemplateDirectory,
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
      });
      const currentProcess = agentProcess;
      currentProcess.stdout.setEncoding("utf8");
      currentProcess.stderr.setEncoding("utf8");
      currentProcess.stdout.on("data", (chunk) => {
        const lines = `${stdoutRemainder}${chunk}`.split(/\r?\n/);
        stdoutRemainder = lines.pop() || "";
        for (const line of lines) handleOutputLine(line);
      });
      currentProcess.stderr.on("data", (chunk) => {
        for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
          appendLog({ timestamp: new Date().toISOString(), event: "stderr", level: "error", message: line, detail: "", raw: line });
        }
      });
      currentProcess.on("error", (error) => {
        appendLog({ timestamp: new Date().toISOString(), event: "process_error", level: "error", message: `Không khởi động được Agent: ${error.message}`, detail: error.stack || "", raw: error.message });
        updateStatus("error", `Không khởi động được Agent: ${error.message}`);
      });
      currentProcess.on("exit", (code, signal) => {
        if (stdoutRemainder.trim()) handleOutputLine(stdoutRemainder);
        stdoutRemainder = "";
        if (agentProcess === currentProcess) agentProcess = null;
        if (stoppingForRestart) return;
        if (quitting) return;
        if (code === 0) updateStatus("stopped", "Agent đã dừng. Bấm Khởi động Agent để tiếp tục in.");
        else updateStatus("error", `Agent đã dừng bất thường${signal ? ` (${signal})` : ` (mã ${code})`}. Mở nhật ký để xem chi tiết.`);
      });
      currentProcess.on("spawn", () => {
        status.pid = currentProcess.pid;
        updateStatus("connecting", "Đang kết nối Agent tới máy chủ.");
      });
      return { started: true };
    } catch (error) {
      agentProcess = null;
      updateStatus("error", `Không khởi động được Agent: ${error.message}`);
      return { started: false, error: error.message };
    }
  }

  function stopAgent() {
    const currentProcess = agentProcess;
    if (!currentProcess || currentProcess.exitCode !== null) {
      agentProcess = null;
      stoppingForRestart = false;
      updateStatus("stopped", "Agent đang tạm dừng; máy này sẽ không nhận lệnh in.");
      return Promise.resolve({ stopped: true });
    }

    updateStatus("stopping", "Đang ngắt kết nối an toàn khỏi máy chủ.");
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (currentProcess.exitCode === null) currentProcess.kill();
      }, 125_000);
      currentProcess.once("exit", () => {
        clearTimeout(timeout);
        if (agentProcess === currentProcess) agentProcess = null;
        stoppingForRestart = false;
        if (!quitting) updateStatus("stopped", "Agent đang tạm dừng; máy này sẽ không nhận lệnh in.");
        resolve({ stopped: true });
      });
      try {
        currentProcess.send({ type: "shutdown" });
      } catch {
        currentProcess.kill();
      }
    });
  }

  async function reconnectAgent() {
    if (agentProcess && agentProcess.exitCode === null) {
      stoppingForRestart = true;
      updateStatus("reconnecting", "Đang khởi động lại kết nối Agent.");
      await stopAgent();
    }
    stoppingForRestart = false;
    return startAgent();
  }

  function showWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  function createWindow() {
    const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
    const windowWidth = Math.min(1080, Math.max(860, workWidth - 48));
    const windowHeight = Math.min(780, Math.max(620, workHeight - 48));
    const appIcon = createAppIcon();
    mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      minWidth: Math.min(860, workWidth),
      minHeight: Math.min(620, workHeight),
      show: false,
      backgroundColor: "#f3f6f8",
      title: "HPO Print Agent",
      icon: appIcon,
      webPreferences: {
        preload: path.join(desktopDirectory, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow.loadFile(path.join(desktopDirectory, "index.html"));
    mainWindow.once("ready-to-show", () => mainWindow.show());
    mainWindow.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });
    mainWindow.on("closed", () => { mainWindow = null; });
  }

  function createAppIcon() {
    const iconPath = path.join(installDirectory, "app.ico");
    const installedIcon = nativeImage.createFromPath(iconPath);
    if (!installedIcon.isEmpty()) return installedIcon;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0d8279"/><path d="M9 9h10a6 6 0 0 1 0 12h-4v4H9zm6 5v3h4a1.5 1.5 0 0 0 0-3z" fill="white"/></svg>`;
    return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }

  function createTray() {
    tray = new Tray(createAppIcon());
    tray.on("click", showWindow);
    updateTray();
  }

  ipcMain.handle("agent:get-state", () => ({ ...status }));
  ipcMain.handle("agent:get-logs", () => [...logBuffer]);
  ipcMain.handle("agent:start", () => startAgent());
  ipcMain.handle("agent:reconnect", () => reconnectAgent());
  ipcMain.handle("agent:stop", () => stopAgent());
  ipcMain.handle("agent:open-logs", async () => {
    if (!config?.logDirectory) return { error: "Chưa có thư mục log." };
    const error = await shell.openPath(config.logDirectory);
    return error ? { error } : { opened: true };
  });
  ipcMain.handle("templates:list", () => getTemplateStatuses());
  ipcMain.handle("templates:choose", (_event, type) => chooseTemplate(type));
  ipcMain.handle("templates:reset", (_event, type) => resetTemplate(type));

  app.on("second-instance", showWindow);
  app.whenReady().then(async () => {
    customTemplateDirectory = path.join(app.getPath("appData"), "HPO Print Agent", "templates");
    templateMetadataPath = path.join(app.getPath("appData"), "HPO Print Agent", "template-settings.json");
    createWindow();
    createTray();
    try {
      await loadConfig();
      status = { ...status, agentId: config.agentId, printerName: config.printerName || "Chưa chọn máy in", serverUrl: config.serverUrl };
      broadcast("agent:history", logBuffer);
      startAgent();
    } catch (error) {
      const message = error.code === "ENOENT"
        ? "Ứng dụng chưa được cài đặt hoặc chưa ghép nối. Hãy chạy Setup.exe để cấu hình máy in."
        : error.message;
      updateStatus("error", message);
      appendLog({ timestamp: new Date().toISOString(), event: "configuration_error", level: "error", message, detail: error.stack || "", raw: error.message });
    }
  });

  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    stopAgent().finally(() => app.quit());
  });

  app.on("will-quit", () => {
    if (tray && !tray.isDestroyed()) tray.destroy();
  });
}
