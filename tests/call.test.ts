/**
 * Tests for call.ts — blueprint middleware, param validation, auto-start
 *
 * Uses Node built-in test runner (node:test). Run with:
 *   npx tsx --test tests/call.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { McpmContext, McpmParams, RunningServer, ServerConfig, Tool } from "../src/operations/types.js";

// We need to re-import call for each test group to reset module-level blueprintEnabled state.
// Since it's a module-level let, we isolate via a factory that creates fresh contexts.

// Dynamically import call and middleware reset (ESM)
const { call } = await import("../src/operations/call/call.js");
const { resetBlueprintState } = await import("../src/operations/call/middleware.js");

// ============ Test Helpers ============

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
  const defaults: McpmContext = {
    SERVERS: {
      "blueprint-extra": { name: "blueprint-extra", timeout: 5000 } as ServerConfig,
      "wiki-lite": { name: "wiki-lite", timeout: 5000 } as ServerConfig,
    },
    RUNNING: {
      "blueprint-extra": makeRunningServer(),
      "wiki-lite": makeRunningServer(),
    },
    TOOLS: {
      "wiki-lite": [
        {
          name: "wiki_search",
          description: "Search wiki",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" }, space_key: { type: "string" } },
            required: ["query"],
          },
        },
      ],
    },
    TOOL_MAP: {},
    BASE_DIR: "/tmp/test",
    MCP_ROOT: "/tmp",
    SERVERS_FILE: "/tmp/test/servers.yaml",
    log: () => {},
    loadServersConfig: () => 0,
    loadCapabilitiesCache: () => ({}),
    updateCapabilitiesCache: () => {},
    saveServersConfig: () => {},
    startServer: async () => [true, "started"],
    stopServer: () => [true, "stopped"],
    restartServer: async () => [true, "restarted"],
    callServerTool: async (_timeout: number, _server: RunningServer, _tool: string, _args: any) => ({
      content: [{ type: "text", text: "ok" }],
    }),
    readServerMetadata: () => null,
    projectName: "test-project",
    allowedServers: null,
    isServerAllowed: () => true,
  };

  return { ...defaults, ...overrides };
}

function makeParams(overrides: Partial<McpmParams> = {}): McpmParams {
  return {
    operation: "call",
    server: "wiki-lite",
    tool: "wiki_search",
    arguments: { query: "test" },
    ...overrides,
  };
}

// ============ Tests ============

describe("call: basic validation", () => {
  it("returns error when server param missing", async () => {
    const ctx = makeContext();
    const result = await call(ctx, makeParams({ server: undefined }));
    assert.match(result.content[0].text, /server parameter required/);
  });

  it("returns error when tool param missing", async () => {
    const ctx = makeContext();
    const result = await call(ctx, makeParams({ tool: undefined }));
    assert.match(result.content[0].text, /tool parameter required/);
  });

  it("blocks disallowed server", async () => {
    const ctx = makeContext({ isServerAllowed: () => false, allowedServers: ["wiki-lite"] });
    const result = await call(ctx, makeParams({ server: "blueprint-extra", tool: "enable" }));
    assert.match(result.content[0].text, /not allowed/);
  });
});

describe("call: argument normalization", () => {
  it("parses JSON string arguments", async () => {
    let capturedArgs: any;
    const ctx = makeContext({
      callServerTool: async (_t, _s, _tool, args) => {
        capturedArgs = args;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });
    const result = await call(ctx, makeParams({ arguments: '{"query":"hello"}' as any }));
    assert.equal(result.content[0].text, "ok");
    assert.equal(capturedArgs.query, "hello");
  });

  it("wraps non-JSON string in expression key", async () => {
    let capturedArgs: any;
    const ctx = makeContext({
      callServerTool: async (_t, _s, _tool, args) => {
        capturedArgs = args;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });
    // Use a non-blueprint server with no required params to test raw string normalization
    ctx.TOOLS["wiki-lite"] = [{ name: "wiki_search" }];
    await call(ctx, makeParams({ server: "wiki-lite", tool: "wiki_search", arguments: "raw text" as any }));
    assert.equal(capturedArgs.expression, "raw text");
  });
});

describe("call: blueprint auto-inject client_id", () => {
  it("injects client_id on enable call when missing", async () => {
    let capturedArgs: any;
    const ctx = makeContext({
      callServerTool: async (_t, _s, _tool, args) => {
        capturedArgs = args;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    await call(ctx, makeParams({ server: "blueprint-extra", tool: "enable", arguments: {} }));
    assert.equal(capturedArgs.client_id, "test-project");
  });

  it("does not overwrite existing client_id", async () => {
    let capturedArgs: any;
    const ctx = makeContext({
      callServerTool: async (_t, _s, _tool, args) => {
        capturedArgs = args;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    await call(ctx, makeParams({
      server: "blueprint-extra",
      tool: "enable",
      arguments: { client_id: "custom-id" },
    }));
    assert.equal(capturedArgs.client_id, "custom-id");
  });

  it("falls back to 'claude-code' when projectName is null", async () => {
    let capturedArgs: any;
    const ctx = makeContext({
      projectName: null,
      callServerTool: async (_t, _s, _tool, args) => {
        capturedArgs = args;
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    await call(ctx, makeParams({ server: "blueprint-extra", tool: "enable", arguments: {} }));
    assert.equal(capturedArgs.client_id, "claude-code");
  });
});

describe("call: blueprint auto-enable", () => {
  it("auto-enables blueprint before browser_* calls", async () => {
    resetBlueprintState();
    const toolsCalled: string[] = [];
    const ctx = makeContext({
      callServerTool: async (_t, _s, tool, _args) => {
        toolsCalled.push(tool);
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    // First browser_ call should trigger auto-enable
    await call(ctx, makeParams({ server: "blueprint-extra", tool: "browser_navigate", arguments: { url: "https://example.com" } }));

    assert.ok(toolsCalled.includes("enable"), "should have called enable");
    assert.ok(toolsCalled.includes("browser_navigate"), "should have called browser_navigate");
    assert.equal(toolsCalled.indexOf("enable"), 0, "enable should be called first");
  });

  it("skips auto-enable after explicit enable call", async () => {
    const toolsCalled: string[] = [];
    const ctx = makeContext({
      callServerTool: async (_t, _s, tool, _args) => {
        toolsCalled.push(tool);
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    // First: explicit enable
    await call(ctx, makeParams({ server: "blueprint-extra", tool: "enable", arguments: {} }));
    toolsCalled.length = 0;

    // Second: browser_ call should NOT trigger auto-enable
    await call(ctx, makeParams({ server: "blueprint-extra", tool: "browser_click", arguments: { selector: "#btn" } }));

    assert.ok(!toolsCalled.includes("enable"), "should not auto-enable after explicit enable");
    assert.deepEqual(toolsCalled, ["browser_click"]);
  });

  it("returns error and resets state when auto-enable fails", async () => {
    resetBlueprintState();
    let callCount = 0;
    const ctx = makeContext({
      callServerTool: async (_t, _s, tool, _args) => {
        callCount++;
        if (tool === "enable") {
          return { content: [{ type: "text", text: "❌ Connection failed" }] };
        }
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    const result = await call(ctx, makeParams({
      server: "blueprint-extra",
      tool: "browser_navigate",
      arguments: { url: "https://example.com" },
    }));

    assert.match(result.content[0].text, /Auto-enable failed/);
    assert.equal(callCount, 1, "should only call enable, not browser_navigate");
  });

  it("resets blueprintEnabled on disable call", async () => {
    const toolsCalled: string[] = [];
    const ctx = makeContext({
      callServerTool: async (_t, _s, tool, _args) => {
        toolsCalled.push(tool);
        return { content: [{ type: "text", text: "ok" }] };
      },
    });

    // Enable
    await call(ctx, makeParams({ server: "blueprint-extra", tool: "enable", arguments: {} }));
    // Disable
    await call(ctx, makeParams({ server: "blueprint-extra", tool: "disable", arguments: {} }));
    toolsCalled.length = 0;

    // browser_ call should trigger auto-enable again
    await call(ctx, makeParams({ server: "blueprint-extra", tool: "browser_click", arguments: { selector: "#x" } }));

    assert.ok(toolsCalled.includes("enable"), "should auto-enable after disable");
  });
});

describe("call: required param validation (non-blueprint)", () => {
  it("rejects call missing required params", async () => {
    const ctx = makeContext();
    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: {},
    }));
    assert.match(result.content[0].text, /requires: query/);
  });

  it("rejects empty string for required param", async () => {
    const ctx = makeContext();
    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "" },
    }));
    assert.match(result.content[0].text, /requires: query/);
  });

  it("passes when all required params present", async () => {
    const ctx = makeContext();
    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));
    assert.equal(result.content[0].text, "ok");
  });

  it("skips validation for blueprint-extra", async () => {
    // Blueprint has its own middleware, no generic param validation
    const ctx = makeContext({
      TOOLS: {
        "blueprint-extra": [{
          name: "enable",
          inputSchema: { type: "object", required: ["client_id"], properties: {} },
        }],
      },
    });

    // Should NOT fail on missing client_id because middleware injects it
    const result = await call(ctx, makeParams({
      server: "blueprint-extra",
      tool: "enable",
      arguments: {},
    }));
    assert.equal(result.content[0].text, "ok");
  });
});

describe("call: auto-start server", () => {
  it("auto-starts stopped server that exists in registry", async () => {
    let started = false;
    const ctx = makeContext({
      RUNNING: {}, // No servers running
      startServer: async (name: string) => {
        started = true;
        // Simulate server now running
        ctx.RUNNING[name] = makeRunningServer();
        return [true, "started"] as [boolean, string];
      },
    });

    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.ok(started, "should have auto-started");
    assert.equal(result.content[0].text, "ok");
  });

  it("returns error when auto-start fails", async () => {
    const ctx = makeContext({
      RUNNING: {},
      startServer: async () => [false, "port in use"] as [boolean, string],
    });

    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.match(result.content[0].text, /Failed to auto-start/);
  });

  it("returns error for unknown server", async () => {
    const ctx = makeContext({ RUNNING: {} });
    const result = await call(ctx, makeParams({
      server: "nonexistent",
      tool: "some_tool",
      arguments: {},
    }));
    assert.match(result.content[0].text, /not found or disabled/);
  });
});

describe("call: error handling", () => {
  it("catches and returns tool execution errors", async () => {
    const ctx = makeContext({
      callServerTool: async () => { throw new Error("connection refused"); },
    });

    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.match(result.content[0].text, /connection refused/);
  });

  it("does not retry on non-crash errors", async () => {
    let startCalled = false;
    const ctx = makeContext({
      callServerTool: async () => { throw new Error("invalid arguments"); },
      startServer: async () => { startCalled = true; return [true, "started"] as [boolean, string]; },
    });

    await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.ok(!startCalled, "should not attempt restart for non-crash errors");
  });
});

describe("call: auto-retry on crash", () => {
  it("retries after stdin write failure", async () => {
    let callCount = 0;
    const ctx = makeContext({
      callServerTool: async () => {
        callCount++;
        if (callCount === 1) throw new Error("Failed to write to server stdin: write EPIPE");
        return { content: [{ type: "text", text: "retry ok" }] };
      },
      stopServer: () => {
        delete ctx.RUNNING["wiki-lite"];
        return [true, "stopped"] as [boolean, string];
      },
      startServer: async (name: string) => {
        ctx.RUNNING[name] = makeRunningServer();
        return [true, "started"] as [boolean, string];
      },
    });

    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.equal(result.content[0].text, "retry ok");
    assert.equal(callCount, 2, "should have called tool twice (original + retry)");
  });

  it("retries after EPIPE error", async () => {
    let callCount = 0;
    const ctx = makeContext({
      callServerTool: async () => {
        callCount++;
        if (callCount === 1) throw new Error("write EPIPE");
        return { content: [{ type: "text", text: "ok" }] };
      },
      stopServer: () => {
        delete ctx.RUNNING["wiki-lite"];
        return [true, "stopped"] as [boolean, string];
      },
      startServer: async (name: string) => {
        ctx.RUNNING[name] = makeRunningServer();
        return [true, "started"] as [boolean, string];
      },
    });

    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.equal(result.content[0].text, "ok");
  });

  it("returns error when restart fails", async () => {
    const ctx = makeContext({
      callServerTool: async () => { throw new Error("Failed to write to server stdin: broken"); },
      stopServer: () => {
        delete ctx.RUNNING["wiki-lite"];
        return [true, "stopped"] as [boolean, string];
      },
      startServer: async () => [false, "port in use"] as [boolean, string],
    });

    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.match(result.content[0].text, /restart failed/);
    assert.match(result.content[0].text, /port in use/);
  });

  it("returns retry error when retry also fails", async () => {
    const ctx = makeContext({
      callServerTool: async () => { throw new Error("Failed to write to server stdin: broken"); },
      stopServer: () => {
        delete ctx.RUNNING["wiki-lite"];
        return [true, "stopped"] as [boolean, string];
      },
      startServer: async (name: string) => {
        ctx.RUNNING[name] = makeRunningServer();
        return [true, "started"] as [boolean, string];
      },
    });

    const result = await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.match(result.content[0].text, /Error after retry/);
  });

  it("does not retry for disabled servers", async () => {
    let startCalled = false;
    const ctx = makeContext({
      SERVERS: {
        ...makeContext().SERVERS,
        "wiki-lite": { name: "wiki-lite", enabled: false } as any,
      },
      callServerTool: async () => { throw new Error("Failed to write to server stdin: broken"); },
      startServer: async () => { startCalled = true; return [true, "started"] as [boolean, string]; },
    });

    await call(ctx, makeParams({
      server: "wiki-lite",
      tool: "wiki_search",
      arguments: { query: "test" },
    }));

    assert.ok(!startCalled, "should not restart disabled server");
  });
});
