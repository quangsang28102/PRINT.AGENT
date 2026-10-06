import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentLogLine } from "../desktop/agent-log.js";

test("formats a successful registration as a friendly online event", () => {
  const entry = parseAgentLogLine('2026-10-06T03:09:14.578Z registered {"ok":true,"agentId":"TEST-AGENT01","roomId":"room-id"}');
  assert.equal(entry.level, "success");
  assert.equal(entry.message, "Máy chủ đã xác nhận Agent hoạt động.");
  assert.match(entry.detail, /TEST-AGENT01/);
});

test("explains a failed print and keeps its diagnostic detail", () => {
  const entry = parseAgentLogLine('2026-10-06T03:10:00.000Z failed {"jobId":"job-123","message":"Printer is offline"}');
  assert.equal(entry.level, "error");
  assert.equal(entry.message, "In thất bại: Printer is offline");
  assert.match(entry.detail, /job-123/);
});

test("formats print completion without exposing raw log syntax", () => {
  const entry = parseAgentLogLine("2026-10-06T03:11:00.000Z printed job-456");
  assert.equal(entry.level, "success");
  assert.equal(entry.message, "Đã gửi lệnh in thành công.");
  assert.equal(entry.detail, "Mã tác vụ: job-456");
});

test("ignores non-agent output that has no timestamp and event", () => {
  assert.equal(parseAgentLogLine("Error: something happened"), null);
});
