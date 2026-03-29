/**
 * Tests for logs operation — tail log entries with optional server filter
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { McpmContext, McpmParams, ServerConfig } from "../src/operations/types.js";

const { logs } = await import("../src/operations/query/logs.js");

let tempDir: string;

function makeContext(overrides: Partial<McpmContext> = {}): McpmContext {
  return {
    SERVERS: {},
    RUNNING: {},
    TOOLS: {},
    TOOL_MAP: {},
    BASE_DIR: tempDir,
    MCP_ROOT: "/tmp",
    SERVERS_FILE: join(tempDir, "servers.yaml"),
    log: () => {},
    loadServersConfig: () => 0,
    loadCapabilitiesCache: () => ({}),
    updateCapabilitiesCache: () => {},
    saveServersConfig: () => {},
    startServer: async (name: string) => [true, `Started ${name}`],
    stopServer: (name: string) => [true, `Stopped ${name}`],
    restartServer: async (name: string) => [true, `Restarted ${name}`],
    callServerTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
    readServerMetadata: () => null,
    projectName: null,
    allowedServers: null,
    isServerAllowed: () => true,
    ...overrides,
  };
}

function writeLog(lines: string[]): void {
  writeFileSync(join(tempDir, "mcp-manager.log"), lines.join("\n") + "\n");
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "logs-test-"));
});

afterEach(() => {
  try { rmSync(tempDir, { recursive: true }); } catch {}
});

describe("logs: basics", () => {
  it("returns message when no log file exists", async () => {
    const result = await logs(makeContext(), { operation: "logs" });
    assert.match(result.content[0].text, /No log file/);
  });

  it("returns all log lines when unfiltered", async () => {
    writeLog([
      "[2026-03-29T10:00:00Z] Starting wiki-lite",
      "[2026-03-29T10:00:01Z] Started v1-lite",
    ]);
    const result = await logs(makeContext(), { operation: "logs" });
    assert.match(result.content[0].text, /wiki-lite/);
    assert.match(result.content[0].text, /v1-lite/);
    assert.match(result.content[0].text, /last 2 of 2 total/);
  });

  it("filters by server name", async () => {
    writeLog([
      "[2026-03-29T10:00:00Z] [wiki-lite] Starting",
      "[2026-03-29T10:00:01Z] [v1-lite] Started",
      "[2026-03-29T10:00:02Z] [wiki-lite] Ready with 5 tools",
    ]);
    const result = await logs(makeContext(), { operation: "logs", server: "wiki-lite" });
    assert.match(result.content[0].text, /wiki-lite/);
    assert.match(result.content[0].text, /last 2 of 2 matching/);
    assert.ok(!result.content[0].text.includes("[v1-lite]"), "should not include v1-lite lines");
  });

  it("tails last N lines from large log", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `[2026-03-29T10:00:00Z] Line ${i}`);
    writeLog(lines);
    const result = await logs(makeContext(), { operation: "logs" });
    assert.match(result.content[0].text, /last 50 of 100/);
    assert.match(result.content[0].text, /Line 99/);
    assert.ok(!result.content[0].text.includes("Line 0\n"), "should not include earliest lines");
  });
});
