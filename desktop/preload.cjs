const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("printAgent", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getState: () => ipcRenderer.invoke("agent:get-state"),
  getLogs: () => ipcRenderer.invoke("agent:get-logs"),
  start: () => ipcRenderer.invoke("agent:start"),
  reconnect: () => ipcRenderer.invoke("agent:reconnect"),
  stop: () => ipcRenderer.invoke("agent:stop"),
  openLogs: () => ipcRenderer.invoke("agent:open-logs"),
  getTemplates: () => ipcRenderer.invoke("templates:list"),
  chooseTemplate: (type) => ipcRenderer.invoke("templates:choose", type),
  resetTemplate: (type) => ipcRenderer.invoke("templates:reset", type),
  onStatus: (callback) => ipcRenderer.on("agent:status", (_event, status) => callback(status)),
  onLog: (callback) => ipcRenderer.on("agent:log", (_event, entry) => callback(entry)),
  onHistory: (callback) => ipcRenderer.on("agent:history", (_event, entries) => callback(entries)),
});
