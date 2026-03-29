/**
 * Tests for search operation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { McpmContext, ServerConfig, CachedServer, RunningServer } from "../src/operations/types.js";

const { search } = await import("../src/operations/query/search.js");

function makeContext(overrides: Partial<McpmContext> = {}): McpmContext {
  const cache: Record<string, CachedServer> = {
    "wiki-lite": {
      description: "Confluence wiki search and read",
      enabled: true,
      running: false,
      tools: [
        { name: "wiki_search", description: "Search Confluence pages" },
        { name: "wiki_read", description: "Read a wiki page by ID" },
      ],
      lastUpdated: new Date().toISOString(),
    },
    "v1-lite": {
      description: "Vision One security API",
      enabled: true,
      running: true,
      tools: [
        { name: "v1_alerts", description: "Get security alerts" },
        { name: "v1_endpoints", description: "List managed endpoints" },
      ],
      lastUpdated: new Date().toISOString(),
    },
  };

  return {
    SERVERS: {
      "wiki-lite": { name: "wiki-lite", description: "Confluence wiki", enabled: true, tags: ["docs"] } as ServerConfig,
      "v1-lite": { name: "v1-lite", description: "Vision One API", enabled: true, tags: ["security"] } as ServerConfig,
      "disabled-srv": { name: "disabled-srv", description: "Disabled", enabled: false } as ServerConfig,
    },
    RUNNING: {
      "v1-lite": { startedAt: "", lastActivity: Date.now(), toolsCount: 2, requestId: 0, metadata: {} } as RunningServer,
    },
    TOOLS: {},
    TOOL_MAP: {},
    BASE_DIR: "/tmp/test",
    MCP_ROOT: "/tmp",
    SERVERS_FILE: "/tmp/test/servers.yaml",
    log: () => {},
    loadServersConfig: () => 0,
    loadCapabilitiesCache: () => cache,
    updateCapabilitiesCache: () => {},
    saveServersConfig: () => {},
    startServer: async (name: string) => {
      overrides.RUNNING = overrides.RUNNING || {};
      return [true, `Started ${name}`];
    },
    stopServer: () => [true, "stopped"],
    restartServer: async () => [true, "restarted"],
    callServerTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
    readServerMetadata: () => null,
    projectName: null,
    allowedServers: null,
    isServerAllowed: () => true,
    ...overrides,
  };
}

describe("search: basics", () => {
  it("requires query parameter", async () => {
    const result = await search(makeContext(), { operation: "search" });
    assert.match(result.content[0].text, /query parameter required/);
  });

  it("returns no matches for unknown term", async () => {
    const result = await search(makeContext(), { operation: "search", query: "nonexistent_xyz" });
    assert.match(result.content[0].text, /No matches/);
  });
});

describe("search: server matching", () => {
  it("matches server by name", async () => {
    const result = await search(makeContext(), { operation: "search", query: "wiki" });
    assert.match(result.content[0].text, /wiki-lite/);
  });

  it("matches server by description", async () => {
    const result = await search(makeContext(), { operation: "search", query: "confluence" });
    assert.match(result.content[0].text, /wiki-lite/);
  });

  it("matches server by tags", async () => {
    const result = await search(makeContext(), { operation: "search", query: "security" });
    assert.match(result.content[0].text, /v1-lite/);
  });

  it("skips disabled servers", async () => {
    const result = await search(makeContext(), { operation: "search", query: "disabled" });
    assert.match(result.content[0].text, /No matches/);
  });
});

describe("search: tool matching", () => {
  it("matches tools by name", async () => {
    const result = await search(makeContext(), { operation: "search", query: "alerts" });
    const text = result.content[0].text;
    assert.match(text, /v1_alerts/);
    assert.match(text, /v1-lite/);
  });

  it("matches tools by description", async () => {
    const result = await search(makeContext(), { operation: "search", query: "endpoints" });
    assert.match(result.content[0].text, /v1_endpoints/);
  });
});

describe("search: case insensitive", () => {
  it("matches regardless of case", async () => {
    const result = await search(makeContext(), { operation: "search", query: "WIKI" });
    assert.match(result.content[0].text, /wiki-lite/);
  });
});

describe("search: status display", () => {
  it("shows RUNNING status for running servers", async () => {
    const result = await search(makeContext(), { operation: "search", query: "v1" });
    assert.match(result.content[0].text, /RUNNING/);
  });

  it("shows STOPPED status for stopped servers", async () => {
    const result = await search(makeContext(), { operation: "search", query: "wiki" });
    assert.match(result.content[0].text, /STOPPED/);
  });
});
