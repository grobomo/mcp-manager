/**
 * Tests for registry operations — add, remove, reload, discover
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpmContext, McpmParams, ServerConfig } from "../src/operations/types.js";

const { add, remove, reload, discover } = await import("../src/operations/admin/registry.js");

// ============ Helpers ============

function makeContext(overrides: Partial<McpmContext> = {}): McpmContext {
  return {
    SERVERS: {
      "wiki-lite": { name: "wiki-lite", command: "node", args: ["server.js"], enabled: true } as ServerConfig,
      "v1-lite": { name: "v1-lite", command: "python", args: ["server.py"], enabled: true } as ServerConfig,
    },
    RUNNING: {},
    TOOLS: {},
    TOOL_MAP: {},
    BASE_DIR: "/tmp/test",
    MCP_ROOT: "/tmp/nonexistent-mcp-root",
    SERVERS_FILE: "/tmp/test/servers.yaml",
    log: () => {},
    loadServersConfig: () => 2,
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

// ============ add ============

describe("registry: add", () => {
  it("requires server parameter", async () => {
    const result = await add(makeContext(), { operation: "add" } as McpmParams);
    assert.match(result.content[0].text, /server parameter required/);
  });

  it("requires command parameter", async () => {
    const result = await add(makeContext(), { operation: "add", server: "new-server" } as McpmParams);
    assert.match(result.content[0].text, /command parameter required/);
  });

  it("rejects duplicate server name", async () => {
    const result = await add(makeContext(), { operation: "add", server: "wiki-lite", command: "node" });
    assert.match(result.content[0].text, /already exists/);
  });

  it("adds a new server with all fields", async () => {
    let saved = false;
    const ctx = makeContext({ saveServersConfig: () => { saved = true; } });
    const result = await add(ctx, {
      operation: "add",
      server: "new-server",
      command: "node",
      args: ["index.js"],
      description: "A new server",
      env: { API_KEY: "test" },
      tags: ["node", "test"],
      auto_start: true,
    });
    assert.match(result.content[0].text, /Added server: new-server/);
    assert.ok(saved, "should save config after add");
    assert.equal(ctx.SERVERS["new-server"].command, "node");
    assert.deepEqual(ctx.SERVERS["new-server"].args, ["index.js"]);
    assert.equal(ctx.SERVERS["new-server"].description, "A new server");
    assert.deepEqual(ctx.SERVERS["new-server"].env, { API_KEY: "test" });
    assert.deepEqual(ctx.SERVERS["new-server"].tags, ["node", "test"]);
    assert.equal(ctx.SERVERS["new-server"].auto_start, true);
    assert.equal(ctx.SERVERS["new-server"].enabled, true);
  });

  it("adds a server with minimal fields (defaults)", async () => {
    const ctx = makeContext();
    await add(ctx, { operation: "add", server: "minimal", command: "python" });
    assert.equal(ctx.SERVERS["minimal"].command, "python");
    assert.deepEqual(ctx.SERVERS["minimal"].args, []);
    assert.equal(ctx.SERVERS["minimal"].description, "");
    assert.deepEqual(ctx.SERVERS["minimal"].env, {});
    assert.equal(ctx.SERVERS["minimal"].auto_start, false);
    assert.deepEqual(ctx.SERVERS["minimal"].tags, []);
  });
});

// ============ remove ============

describe("registry: remove", () => {
  it("requires server parameter", async () => {
    const result = await remove(makeContext(), { operation: "remove" } as McpmParams);
    assert.match(result.content[0].text, /server parameter required/);
  });

  it("rejects unknown server", async () => {
    const result = await remove(makeContext(), { operation: "remove", server: "nonexistent" });
    assert.match(result.content[0].text, /Unknown server/);
  });

  it("removes a server", async () => {
    let saved = false;
    const ctx = makeContext({ saveServersConfig: () => { saved = true; } });
    const result = await remove(ctx, { operation: "remove", server: "wiki-lite" });
    assert.match(result.content[0].text, /Removed server: wiki-lite/);
    assert.ok(!("wiki-lite" in ctx.SERVERS), "server should be deleted");
    assert.ok(saved, "should save config after remove");
  });

  it("stops a running server before removing", async () => {
    let stopped = false;
    const ctx = makeContext({
      RUNNING: {
        "wiki-lite": {
          startedAt: new Date().toISOString(),
          lastActivity: Date.now(),
          toolsCount: 0,
          requestId: 0,
          metadata: {},
        },
      },
      stopServer: () => { stopped = true; return [true, "stopped"]; },
    });
    await remove(ctx, { operation: "remove", server: "wiki-lite" });
    assert.ok(stopped, "should stop running server before removing");
    assert.ok(!("wiki-lite" in ctx.SERVERS));
  });
});

// ============ reload ============

describe("registry: reload", () => {
  it("reloads config and reports counts", async () => {
    const ctx = makeContext({
      loadServersConfig: () => 5,
    });
    const result = await reload(ctx);
    assert.match(result.content[0].text, /Reloaded config/);
    assert.match(result.content[0].text, /5 servers/);
    assert.match(result.content[0].text, /was 2/);
    assert.match(result.content[0].text, /0 running/);
  });

  it("reports running count", async () => {
    const ctx = makeContext({
      RUNNING: {
        "wiki-lite": { startedAt: "", lastActivity: 0, toolsCount: 0, requestId: 0, metadata: {} },
        "v1-lite": { startedAt: "", lastActivity: 0, toolsCount: 0, requestId: 0, metadata: {} },
      },
      loadServersConfig: () => 3,
    });
    const result = await reload(ctx);
    assert.match(result.content[0].text, /2 running/);
  });

  it("handles reload failure", async () => {
    const ctx = makeContext({
      loadServersConfig: () => { throw new Error("YAML parse error"); },
    });
    const result = await reload(ctx);
    assert.match(result.content[0].text, /Failed to reload/);
    assert.match(result.content[0].text, /YAML parse error/);
  });
});

// ============ discover ============

describe("registry: discover", () => {
  it("returns empty when MCP_ROOT does not exist", async () => {
    const ctx = makeContext({ MCP_ROOT: "/tmp/definitely-nonexistent-path-12345" });
    const result = await discover(ctx);
    assert.match(result.content[0].text, /Found 0/);
    assert.match(result.content[0].text, /Created 0/);
    assert.match(result.content[0].text, /Registered 0/);
  });
});
