/**
 * Tests for lifecycle operations — start, stop, restart, enable
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpmContext, McpmParams, RunningServer, ServerConfig } from "../src/operations/types.js";

const { start, stop, restart, enable } = await import("../src/operations/admin/lifecycle.js");

// ============ Helpers ============

function makeRunningServer(overrides: Partial<RunningServer> = {}): RunningServer {
  return {
    startedAt: new Date().toISOString(),
    lastActivity: Date.now(),
    toolsCount: 0,
    requestId: 0,
    metadata: {},
    ...overrides,
  };
}

function makeContext(overrides: Partial<McpmContext> = {}): McpmContext {
  return {
    SERVERS: {
      "wiki-lite": { name: "wiki-lite", enabled: true } as ServerConfig,
      "disabled-server": { name: "disabled-server", enabled: false } as ServerConfig,
    },
    RUNNING: {},
    TOOLS: {},
    TOOL_MAP: {},
    BASE_DIR: "/tmp/test",
    MCP_ROOT: "/tmp",
    SERVERS_FILE: "/tmp/test/servers.yaml",
    log: () => {},
    loadServersConfig: () => 0,
    loadCapabilitiesCache: () => ({}),
    updateCapabilitiesCache: () => {},
    saveServersConfig: () => {},
    startServer: async (name: string) => [true, `Started ${name} with 5 tools`],
    stopServer: (name: string) => [true, `Stopped ${name} (stdio)`],
    restartServer: async (name: string) => [true, `Started ${name} with 5 tools`],
    callServerTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
    readServerMetadata: () => null,
    projectName: null,
    allowedServers: null,
    isServerAllowed: () => true,
    ...overrides,
  };
}

// ============ Tests ============

describe("lifecycle: start", () => {
  it("requires server parameter", async () => {
    const result = await start(makeContext(), { operation: "start" } as McpmParams);
    assert.match(result.content[0].text, /server parameter required/);
  });

  it("starts a server successfully", async () => {
    const result = await start(makeContext(), { operation: "start", server: "wiki-lite" });
    assert.match(result.content[0].text, /Started wiki-lite/);
  });

  it("returns error message on failure", async () => {
    const ctx = makeContext({
      startServer: async () => [false, "Port already in use"],
    });
    const result = await start(ctx, { operation: "start", server: "wiki-lite" });
    assert.match(result.content[0].text, /Port already in use/);
  });
});

describe("lifecycle: stop", () => {
  it("requires server parameter", async () => {
    const result = await stop(makeContext(), { operation: "stop" } as McpmParams);
    assert.match(result.content[0].text, /server parameter required/);
  });

  it("stops a server successfully", async () => {
    const result = await stop(makeContext(), { operation: "stop", server: "wiki-lite" });
    assert.match(result.content[0].text, /Stopped wiki-lite/);
  });

  it("returns error when stop fails", async () => {
    const ctx = makeContext({
      stopServer: () => [false, "Server not running: wiki-lite"],
    });
    const result = await stop(ctx, { operation: "stop", server: "wiki-lite" });
    assert.match(result.content[0].text, /not running/);
  });
});

describe("lifecycle: restart", () => {
  it("requires server parameter", async () => {
    const result = await restart(makeContext(), { operation: "restart" } as McpmParams);
    assert.match(result.content[0].text, /server parameter required/);
  });

  it("restarts a server successfully", async () => {
    const result = await restart(makeContext(), { operation: "restart", server: "wiki-lite" });
    assert.match(result.content[0].text, /Started wiki-lite/);
  });
});

describe("lifecycle: enable", () => {
  it("requires server parameter", async () => {
    const result = await enable(makeContext(), { operation: "enable" } as McpmParams);
    assert.match(result.content[0].text, /server parameter required/);
  });

  it("returns error for unknown server", async () => {
    const result = await enable(makeContext(), { operation: "enable", server: "nonexistent" });
    assert.match(result.content[0].text, /Unknown server/);
  });

  it("enables a server", async () => {
    const ctx = makeContext();
    const result = await enable(ctx, { operation: "enable", server: "disabled-server", enabled: true });
    assert.match(result.content[0].text, /Enabled/);
    assert.equal(ctx.SERVERS["disabled-server"].enabled, true);
  });

  it("disables a server and stops it if running", async () => {
    let stopped = false;
    const ctx = makeContext({
      RUNNING: { "wiki-lite": makeRunningServer() },
      stopServer: () => { stopped = true; return [true, "stopped"]; },
    });
    const result = await enable(ctx, { operation: "enable", server: "wiki-lite", enabled: false });
    assert.match(result.content[0].text, /Disabled/);
    assert.equal(ctx.SERVERS["wiki-lite"].enabled, false);
    assert.ok(stopped, "should have stopped the running server");
  });

  it("saves config after enabling", async () => {
    let saved = false;
    const ctx = makeContext({ saveServersConfig: () => { saved = true; } });
    await enable(ctx, { operation: "enable", server: "wiki-lite", enabled: true });
    assert.ok(saved);
  });
});
