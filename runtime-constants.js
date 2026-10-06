/**
 * Runtime constants bundled with Print Agent.
 *
 * Agent packages must be installable without the EXAM.SERVER source tree.
 */
export const PRINT_DEFAULTS = Object.freeze({
  COPIES: 1,
  HEARTBEAT_INTERVAL: 15_000,
  SOCKET_RECONNECT_DELAY: 1_000,
  SOCKET_RECONNECT_DELAY_MAX: 30_000,
});

export const PRINT_ERROR_CODE = Object.freeze({
  AGENT_PRINT_FAILED: "AGENT_PRINT_FAILED",
});

export const PRINT_TIMEOUT_MS = Object.freeze({
  HEARTBEAT_INTERVAL: 15_000,
  SOCKET_RECONNECT_DELAY: 1_000,
  SOCKET_RECONNECT_DELAY_MAX: 30_000,
});

export const PRINT_PROGRESS_STATUS = Object.freeze({ PRINTING: "printing" });

export const PRINT_SOCKET_EVENTS = Object.freeze({
  REGISTER: "PrintAgentRegister",
  HEARTBEAT: "PrintAgentHeartbeat",
  JOB_AVAILABLE: "PrintJobAvailable",
  JOB_ACCEPTED: "PrintJobAccepted",
  JOB_PROGRESS: "PrintJobProgress",
  JOB_COMPLETED: "PrintJobCompleted",
  JOB_FAILED: "PrintJobFailed",
});
