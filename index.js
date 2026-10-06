import fs from "fs/promises";
import path from "path";
import { execFile as execFileCallback } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { io } from "socket.io-client";
import { PRINT_DEFAULTS, PRINT_ERROR_CODE, PRINT_PROGRESS_STATUS, PRINT_SOCKET_EVENTS } from "./runtime-constants.js";
import { renderWordTemplate } from "./wordPrintRenderer.js";

const execFile = promisify(execFileCallback);
const agentDirectory = path.dirname(fileURLToPath(import.meta.url));
const printScript = path.join(agentDirectory, "print-docx.ps1");
const configPath = process.env.PRINT_AGENT_CONFIG || path.join(agentDirectory, "config.json");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
if (!config.serverUrl || !config.agentToken || !config.agentId) throw new Error("config.json thiếu serverUrl, agentToken hoặc agentId");

await fs.mkdir(config.tempDirectory, { recursive: true });
await fs.mkdir(config.logDirectory, { recursive: true });

const log = (message, data = "") => {
  const line = `${new Date().toISOString()} ${message} ${typeof data === "string" ? data : JSON.stringify(data)}`;
  console.log(line);
  return fs.appendFile(path.join(config.logDirectory, "agent.log"), `${line}\n`).catch(() => {});
};

const discoverPrintersWithPowerShell = async () => {
  const command = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); @(Get-Printer | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress";
  const { stdout } = await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
  if (!stdout.trim()) return [];
  const value = JSON.parse(stdout);
  return (Array.isArray(value) ? value : [value]).filter(Boolean).map((name) => ({ windowsName: String(name), name: String(name) }));
};

const discoverPrinters = async () => {
  try {
    const printers = await discoverPrintersWithPowerShell();
    log("printer_discovery_fallback", { count: printers.length });
    return printers;
  } catch (error) { log("printer_discovery_fallback_failed", error.message); return []; }
};

const printWordDocument = async (documentPath, printerName, copies = PRINT_DEFAULTS.COPIES) => {
  await execFile("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", printScript,
    "-DocumentPath", documentPath, "-PrinterName", printerName, "-Copies",
    String(Math.max(1, Math.min(Number(copies) || 1, 10))),
  ], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
};

const socket = io(`${config.serverUrl}/print-agents`, {
  path: config.socketPath || "/device",
  auth: { token: config.agentToken },
  reconnection: true,
  reconnectionDelay: PRINT_DEFAULTS.SOCKET_RECONNECT_DELAY,
  reconnectionDelayMax: PRINT_DEFAULTS.SOCKET_RECONNECT_DELAY_MAX,
});
const activeJobs = new Set();
let shutdownRequested = false;

log("starting", { agentId: config.agentId, serverUrl: config.serverUrl, serviceVersion: config.serviceVersion });
socket.on("connect", async () => {
  log("connected");
  socket.emit(PRINT_SOCKET_EVENTS.REGISTER, {
    agentId: config.agentId,
    machineName: process.env.COMPUTERNAME,
    serviceVersion: config.serviceVersion,
    defaultPrinterName: config.printerName,
    printers: await discoverPrinters(),
  }, (ack) => log("registered", ack));
});
socket.on("connect_error", (error) => log("connect_error", error.message));
socket.on("disconnect", (reason) => log("disconnected", reason));
setInterval(() => {
  if (socket.connected) socket.emit(PRINT_SOCKET_EVENTS.HEARTBEAT, { agentId: config.agentId, atUtc: new Date().toISOString() });
}, PRINT_DEFAULTS.HEARTBEAT_INTERVAL).unref();

socket.on(PRINT_SOCKET_EVENTS.JOB_AVAILABLE, async (job) => {
  if (activeJobs.has(job.jobId)) return;
  activeJobs.add(job.jobId);
  const documentPath = path.join(config.tempDirectory, `${job.jobId}.docx`);
  try {
    socket.emit(PRINT_SOCKET_EVENTS.JOB_ACCEPTED, { jobId: job.jobId });
    const response = await fetch(new URL(job.payloadEndpoint, config.serverUrl), { headers: { Authorization: `Bearer ${config.agentToken}` } });
    if (!response.ok) throw new Error(`Print payload download failed (${response.status})`);
    const payload = await response.json();
    await renderWordTemplate(payload.templateType || job.templateType, payload.templateData, documentPath, {
      customTemplateDirectory: process.env.PRINT_AGENT_TEMPLATE_DIRECTORY,
    });
    socket.emit(PRINT_SOCKET_EVENTS.JOB_PROGRESS, { jobId: job.jobId, status: PRINT_PROGRESS_STATUS.PRINTING });
    await printWordDocument(documentPath, job.printerName, job.copies);
    socket.emit(PRINT_SOCKET_EVENTS.JOB_COMPLETED, { jobId: job.jobId });
    log("printed", job.jobId);
  } catch (error) {
    socket.emit(PRINT_SOCKET_EVENTS.JOB_FAILED, { jobId: job.jobId, code: PRINT_ERROR_CODE.AGENT_PRINT_FAILED, message: error.message });
    log("failed", { jobId: job.jobId, message: error.message });
  } finally {
    activeJobs.delete(job.jobId);
    await fs.rm(documentPath, { force: true }).catch(() => {});
  }
});

async function stopAgent() {
  if (shutdownRequested) return;
  shutdownRequested = true;
  socket.close();
  await log("stopping");
  while (activeJobs.size > 0) await new Promise((resolve) => setTimeout(resolve, 500));
  await log("stopped");
  process.exit(0);
}

process.on("message", (message) => {
  if (message?.type === "shutdown") void stopAgent();
});
process.on("SIGTERM", () => void stopAgent());
process.on("SIGINT", () => void stopAgent());
