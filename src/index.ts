#!/usr/bin/env node
/**
 * MCP Manager - Dynamic MCP Server Proxy Router (Node.js)
 *
 * Refactored to single mcpm() tool with operation parameter.
 * Token-optimized: ~300 tokens vs ~3000 for 15 separate tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { createInterface } from "readline";
import { sanitizeLog, BASE_DIR, MCP_ROOT } from "./utils.js";
import { loadHooks, executeHooks } from "./hooks.js";

// Operations
import * as ops from "./operations/index.js";
import type { McpmContext, McpmParams, ServerConfig, RunningServer, Tool, CachedServer, PendingRequest } from "./operations/types.js";

// ============ State ============

const SERVERS_FILE = join(BASE_DIR, "servers.yaml");
const LOG_FILE = join(BASE_DIR, "mcp-manager.log");
const CAPABILITIES_CACHE_FILE = join(BASE_DIR, "capabilities-cache.yaml");

let SERVERS: Record<string, ServerConfig> = {};
let RUNNING: Record<string, RunningServer> = {};
let TOOLS: Record<string, Tool[]> = {};
let TOOL_MAP: Record<string, string> = {};

// ============ Logging ============

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const sanitized = sanitizeLog(message);
  const line = `[${timestamp}] ${sanitized}`;
  console.error(line);
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // Ignore write errors
  }
}

// ============ Idle Server Management ============

import { DEFAULT_IDLE_TIMEOUT } from "./utils.js";

const IDLE_CHECK_INTERVAL = 60000;

let idleCheckTimer: NodeJS.Timeout | null = null;

/**
 * Clean up a server's resources: readline, pending requests, tool map, RUNNING entry.
 * Used by stopServer, crash detection, and HTTP health check.
 */
function cleanupServer(name: string, reason: string): void {
  const server = RUNNING[name];
  if (!server) return;

  if (server.readline) {
    server.readline.close();
    server.readline = undefined;
  }
  if (server.pendingRequests) {
    for (const [, pending] of server.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
    server.pendingRequests.clear();
    server.pendingRequests = undefined;
  }
  if (TOOLS[name]) {
    for (const tool of TOOLS[name]) {
      delete TOOL_MAP[`${name}:${tool.name}`];
      if (TOOL_MAP[tool.name] === name) delete TOOL_MAP[tool.name];
    }
    delete TOOLS[name];
  }
  delete RUNNING[name];
}

function checkIdleServers(): void {
  const now = Date.now();
  for (const [name, server] of Object.entries(RUNNING)) {
    const config = SERVERS[name];

    // Health check: detect crashed stdio processes and auto-restart
    if (server.process && server.process.exitCode !== null) {
      log(`HEALTH: ${name} process exited (code ${server.process.exitCode}), cleaning up...`);
      cleanupServer(name, "Server process exited");
      if (config?.auto_start && config?.enabled !== false) {
        log(`HEALTH: ${name} auto-restarting...`);
        startServer(name).then(([ok, msg]) => {
          log(`HEALTH: ${name} restart -> ${ok ? "OK" : msg}`);
        }).catch(e => log(`HEALTH: ${name} restart error: ${e.message}`));
      }
      continue;
    }

    // Health check: detect unreachable HTTP servers
    if (server.url && !server.process) {
      checkHttpServerHealth(name, server, config).catch(() => {});
    }

    // Idle timeout check
    if (config?.tags?.includes("no_auto_stop")) continue;
    const idleTimeout = config?.idle_timeout || DEFAULT_IDLE_TIMEOUT;
    const idleTime = now - server.lastActivity;
    if (idleTime < idleTimeout) continue;
    log(`IDLE: ${name} idle for ${Math.round(idleTime/1000)}s, stopping...`);
    const [success, msg] = stopServer(name);
    log(`IDLE: ${name} -> ${success ? "stopped" : msg}`);
  }
}

async function checkHttpServerHealth(name: string, server: RunningServer, config: ServerConfig): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(server.url!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (e: any) {
    log(`HEALTH: ${name} HTTP unreachable: ${e.message}, removing from RUNNING`);
    cleanupServer(name, `HTTP server unreachable: ${e.message}`);
    if (config?.auto_start && config?.enabled !== false) {
      log(`HEALTH: ${name} auto-restarting...`);
      const [ok, msg] = await startServer(name);
      log(`HEALTH: ${name} restart -> ${ok ? "OK" : msg}`);
    }
  }
}

function startIdleChecker(): void {
  if (idleCheckTimer) return;
  idleCheckTimer = setInterval(checkIdleServers, IDLE_CHECK_INTERVAL);
  log("Idle server checker started (60s interval)");
}

// ============ Config Loading ============

function loadEnv(basePath: string): void {
  const envFile = join(basePath, ".env");
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=").replace(/^["']|["']$/g, "");
        process.env[key.trim()] = value;
      }
    }
  }
}

function loadServersConfig(): number {
  SERVERS = {};
  if (!existsSync(SERVERS_FILE)) return 0;

  const content = readFileSync(SERVERS_FILE, "utf-8");
  const data = parseYaml(content);
  const defaults = data.defaults || {};
  const servers = data.servers || {};

  for (const [name, config] of Object.entries(servers) as [string, any][]) {
    const merged: ServerConfig = { ...defaults, ...config, name };
    if (merged.env) {
      for (const [key, value] of Object.entries(merged.env)) {
        if (typeof value === "string" && value.startsWith("${") && value.endsWith("}")) {
          const envVar = value.slice(2, -1);
          merged.env[key] = process.env[envVar] || "";
        }
      }
    }
    SERVERS[name] = merged;
  }
  return Object.keys(SERVERS).length;
}

function saveServersConfig(): void {
  const data: any = {
    servers: {},
  };
  for (const [name, config] of Object.entries(SERVERS)) {
    // Only strip the 'name' field (redundant with the YAML key)
    const { name: _, ...cleanConfig } = config as any;
    data.servers[name] = cleanConfig;
  }
  writeFileSync(SERVERS_FILE, stringifyYaml(data));
}

// ============ Capabilities Cache ============

function loadCapabilitiesCache(): Record<string, CachedServer> {
  if (!existsSync(CAPABILITIES_CACHE_FILE)) return {};
  try {
    return parseYaml(readFileSync(CAPABILITIES_CACHE_FILE, "utf-8")) || {};
  } catch {
    return {};
  }
}

function updateCapabilitiesCache(): void {
  const cache: Record<string, CachedServer> = {};
  for (const [name, config] of Object.entries(SERVERS)) {
    const tools = TOOLS[name] || [];
    const metadata = readServerMetadata(`mcp-${name}`) || readServerMetadata(name);
    let toolList = tools.map((t) => ({
      name: t.name,
      description: (t.description || "").slice(0, 100),
    }));
    if (toolList.length === 0 && metadata?.capabilities) {
      toolList = metadata.capabilities;
    }
    cache[name] = {
      description: config.description || metadata?.description || "",
      enabled: config.enabled !== false,
      running: name in RUNNING,
      tools: toolList,
      lastUpdated: new Date().toISOString(),
    };
  }
  try {
    writeFileSync(CAPABILITIES_CACHE_FILE, stringifyYaml(cache));
  } catch {}
}

function saveToolsToMetadata(serverName: string, tools: Tool[]): void {
  let metadataPath = join(MCP_ROOT, `mcp-${serverName}`, "metadata.yaml");
  if (!existsSync(dirname(metadataPath))) {
    metadataPath = join(MCP_ROOT, serverName, "metadata.yaml");
  }
  if (!existsSync(dirname(metadataPath))) return;
  try {
    let metadata: Record<string, any> = {};
    if (existsSync(metadataPath)) {
      metadata = parseYaml(readFileSync(metadataPath, "utf-8")) || {};
    }
    metadata.capabilities = tools.map((t) => ({
      name: t.name,
      description: (t.description || "").slice(0, 100),
    }));
    metadata.last_updated = new Date().toISOString();
    writeFileSync(metadataPath, stringifyYaml(metadata));
  } catch {}
}

function readServerMetadata(serverName: string): Record<string, any> | null {
  const metadataPath = join(MCP_ROOT, serverName, "metadata.yaml");
  if (!existsSync(metadataPath)) return null;
  try {
    return parseYaml(readFileSync(metadataPath, "utf-8"));
  } catch {
    return null;
  }
}

// ============ MCP Protocol Client ============

async function sendRequest(
  timeout: number,
  server: RunningServer,
  method: string,
  params?: any
): Promise<any> {
  const requestId = ++server.requestId;
  const request = {
    jsonrpc: "2.0",
    id: requestId,
    method,
    ...(params && { params }),
  };

  // HTTP transport
  if (server.url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(server.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const result = await response.json();
      if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
      return result.result;
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") throw new Error("Request timeout");
      throw e;
    }
  }

  // Stdio transport — use persistent readline per server
  const { stdin } = server.process!;
  if (!stdin) {
    throw new Error("Process stdin not available");
  }

  // Initialize persistent readline on first request
  if (!server.readline) {
    const { stdout } = server.process!;
    if (!stdout) throw new Error("Process stdout not available");

    server.pendingRequests = new Map();
    server.readline = createInterface({ input: stdout });

    server.readline.on("line", (line: string) => {
      if (!line.trim()) return;
      if (!line.startsWith("{")) {
        log(`  [stdout] ${line}`);
        const portMatch = line.match(/\[PortRegistry\] Allocated port (\d+)/);
        if (portMatch && server.metadata) {
          server.metadata.cdpPort = parseInt(portMatch[1], 10);
        }
        return;
      }
      try {
        const response = JSON.parse(line);
        if (response.id == null) return;
        const pending = server.pendingRequests?.get(response.id);
        if (!pending) return;
        server.pendingRequests!.delete(response.id);
        clearTimeout(pending.timeoutId);
        if (response.error) {
          pending.reject(new Error(response.error.message || JSON.stringify(response.error)));
        } else {
          pending.resolve(response.result);
        }
      } catch {}
    });
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      server.pendingRequests?.delete(requestId);
      reject(new Error("Request timeout"));
    }, timeout);

    server.pendingRequests!.set(requestId, { resolve, reject, timeoutId });

    try {
      stdin.write(JSON.stringify(request) + "\n");
    } catch (e: any) {
      clearTimeout(timeoutId);
      server.pendingRequests?.delete(requestId);
      reject(new Error(`Failed to write to server stdin: ${e.message}`));
    }
  });
}

async function initializeServer(server: RunningServer, timeout: number): Promise<any> {
  return sendRequest(timeout, server, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-manager", version: "2.0.0" },
  });
}

async function listServerTools(server: RunningServer, timeout: number): Promise<Tool[]> {
  const result = await sendRequest(timeout, server, "tools/list");
  return result?.tools || [];
}

async function callServerTool(
  timeout: number,
  server: RunningServer,
  toolName: string,
  args: any
): Promise<any> {
  return sendRequest(timeout, server, "tools/call", { name: toolName, arguments: args });
}

// ============ Server Management ============

/** Register tools from a server into TOOLS and TOOL_MAP */
function registerTools(name: string, server: RunningServer, tools: Tool[]): void {
  TOOLS[name] = tools;
  server.toolsCount = tools.length;
  for (const tool of tools) {
    if (tool.name) {
      TOOL_MAP[`${name}:${tool.name}`] = name;
      TOOL_MAP[tool.name] = name;
    }
  }
}

/** Finalize server registration: save metadata, update cache */
function finalizeServerStart(name: string, server: RunningServer): void {
  RUNNING[name] = server;
  saveToolsToMetadata(name, TOOLS[name]);
  updateCapabilitiesCache();
}

async function startServer(name: string): Promise<[boolean, string]> {
  if (!(name in SERVERS)) return [false, `Unknown server: ${name}`];
  if (name in RUNNING) return [false, `Server already running: ${name}`];

  const config = SERVERS[name];
  if (config.enabled === false) return [false, `Server is disabled: ${name}`];

  const reqTimeout = config.timeout || 60000;

  // HTTP transport
  if (config.url) {
    try {
      const server: RunningServer = {
        url: config.url,
        startedAt: new Date().toISOString(),
        lastActivity: Date.now(),
        toolsCount: 0,
        requestId: 0,
        metadata: { transport: "http" },
      };
      try {
        await initializeServer(server, reqTimeout);
      } catch (e: any) {
        return [false, `Failed to initialize HTTP server: ${e.message}`];
      }
      try {
        registerTools(name, server, await listServerTools(server, reqTimeout));
      } catch (e: any) {
        return [false, `Failed to list tools: ${e.message}`];
      }
      finalizeServerStart(name, server);
      return [true, `Connected to ${name} (HTTP) with ${server.toolsCount} tools`];
    } catch (e: any) {
      return [false, `Failed to connect to ${name}: ${e.message}`];
    }
  }

  // Stdio transport
  if (!config.command) return [false, `Server ${name} has no command or url configured`];

  try {
    const cmd = config.command;
    const args = config.args || [];
    const env = { ...process.env, ...(config.env || {}) };
    const startupDelay = config.startup_delay || 2000;

    const proc = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      shell: true,
      cwd: BASE_DIR,
    });

    const server: RunningServer = {
      process: proc,
      startedAt: new Date().toISOString(),
      lastActivity: Date.now(),
      toolsCount: 0,
      requestId: 0,
      metadata: { transport: "stdio" },
    };

    await new Promise((resolve) => setTimeout(resolve, startupDelay));

    try {
      await initializeServer(server, reqTimeout);
    } catch (e: any) {
      proc.kill();
      return [false, `Failed to initialize: ${e.message}`];
    }

    try {
      registerTools(name, server, await listServerTools(server, reqTimeout));
    } catch (e: any) {
      proc.kill();
      return [false, `Failed to list tools: ${e.message}`];
    }

    finalizeServerStart(name, server);
    return [true, `Started ${name} with ${server.toolsCount} tools`];
  } catch (e: any) {
    return [false, `Failed to start ${name}: ${e.message}`];
  }
}

function stopServer(name: string): [boolean, string] {
  if (!(name in RUNNING)) return [false, `Server not running: ${name}`];
  try {
    const server = RUNNING[name];
    const transport = server.url ? "HTTP" : "stdio";
    if (server.process) server.process.kill();
    cleanupServer(name, "Server stopped");
    return [true, `Stopped ${name} (${transport})`];
  } catch (e: any) {
    return [false, `Failed to stop ${name}: ${e.message}`];
  }
}

async function restartServer(name: string): Promise<[boolean, string]> {
  if (name in RUNNING) stopServer(name);
  return startServer(name);
}

// ============ Auto-start ============

async function autoStartServers(): Promise<void> {
  for (const [name, config] of Object.entries(SERVERS)) {
    if (config.auto_start && config.enabled !== false) {
      log(`Auto-starting ${name}...`);
      const [success, msg] = await startServer(name);
      log(`  ${msg}`);
    }
  }
  updateCapabilitiesCache();
  const totalTools = Object.values(TOOLS).flat().length;
  log(`Capabilities cached: ${Object.keys(RUNNING).length} servers, ${totalTools} tools`);
}

// ============ MCP Server ============

const server = new McpServer({
  name: "mcp-manager",
  version: "2.0.0",
});

// ============ Per-Project Context ============

let PROJECT_NAME: string | null = null;
let ALLOWED_SERVERS: string[] | null = null;

function detectProjectContext(): void {
  // Get the directory from which mcp-manager was started
  const projectPath = process.env.MCPM_PROJECT_PATH || process.cwd();
  const mcpJsonPath = join(projectPath, ".mcp.json");
  
  if (!existsSync(mcpJsonPath)) {
    log(`No .mcp.json in ${projectPath} - no project filtering`);
    return;
  }
  
  try {
    const content = readFileSync(mcpJsonPath, "utf-8");
    const config = JSON.parse(content);
    const mcpManager = config.mcpServers?.["mcp-manager"];
    
    if (mcpManager?.allowedServers && Array.isArray(mcpManager.allowedServers)) {
      ALLOWED_SERVERS = mcpManager.allowedServers;
      // Extract project name from cwd (last folder name)
      const parts = projectPath.replace(/\\/g, "/").split("/");
      PROJECT_NAME = parts[parts.length - 1] || null;
      log(`Project: ${PROJECT_NAME}, allowed servers: ${ALLOWED_SERVERS.join(", ")}`);
    } else {
      log(`No allowedServers in ${mcpJsonPath} - no project filtering`);
    }
  } catch (e: any) {
    log(`Failed to parse ${mcpJsonPath}: ${e.message}`);
  }
}

function isServerAllowed(name: string): boolean {
  if (!ALLOWED_SERVERS) return true;  // No restriction
  return ALLOWED_SERVERS.includes(name);
}

// Build context object for operations
function getContext(): McpmContext {
  return {
    SERVERS,
    RUNNING,
    TOOLS,
    TOOL_MAP,
    BASE_DIR,
    MCP_ROOT,
    SERVERS_FILE,
    log,
    loadServersConfig,
    loadCapabilitiesCache,
    updateCapabilitiesCache,
    saveServersConfig,
    startServer,
    stopServer,
    restartServer,
    callServerTool,
    readServerMetadata,
    projectName: PROJECT_NAME,
    allowedServers: ALLOWED_SERVERS,
    isServerAllowed,
  };
}

// Single mcpm tool with operation parameter
const MCPM_DESCRIPTION = `MCP server manager - single tool for all operations.

## Query (read-only)
  list_servers   List all servers with status
  search         Search servers, tools, descriptions (query, auto_start?)
  details        Full info on one server (server)
  tools          List tools (server?)
  status         System health, memory
  help           Show operations

## Call (proxy)
  call           Execute tool on backend (server, tool, arguments?)

## Admin (modify)
  start/stop/restart   Server lifecycle (server)
  enable         Enable/disable server (server, enabled)
  add            Register server (server, command, args?, description?)
  remove         Unregister server (server)
  reload         Reload config
  discover       Scan for new servers
  usage          Project usage
  ram            RAM details`;

server.tool(
  "mcpm",
  MCPM_DESCRIPTION,
  {
    operation: z.string().describe("Operation: list_servers, search, details, tools, status, help, call, start, stop, restart, enable, add, remove, reload, discover, usage, ram"),
    server: z.string().optional().describe("Server name (for server-specific operations)"),
    query: z.string().optional().describe("Search query (for search operation)"),
    tool: z.string().optional().describe("Tool name (for call operation)"),
    arguments: z.union([z.record(z.any()), z.string()]).optional().describe("Tool arguments (for call operation)"),
    enabled: z.boolean().optional().describe("Enable/disable flag (for enable operation)"),
    auto_start: z.boolean().optional().describe("Auto-start flag"),
    command: z.string().optional().describe("Command (for add operation)"),
    args: z.array(z.string()).optional().describe("Command args (for add operation)"),
    description: z.string().optional().describe("Description (for add operation)"),
    env: z.record(z.string()).optional().describe("Environment variables (for add operation)"),
    tags: z.array(z.string()).optional().describe("Tags (for add operation)"),
  },
  async (params: any) => {
    const ctx = getContext();
    const operation = params.operation as string;

    switch (operation) {
      // Query operations
      case "list_servers":
      case "list":
        return ops.listServers(ctx);
      case "search":
      case "find":
        return ops.search(ctx, params);
      case "details":
      case "info":
        return ops.details(ctx, params);
      case "tools":
        return ops.tools(ctx, params);
      case "status":
        return ops.status(ctx);
      case "help":
        return ops.help();

      // Call operation
      case "call":
        return ops.call(ctx, params);

      // Admin operations
      case "start":
        return ops.start(ctx, params);
      case "stop":
        return ops.stop(ctx, params);
      case "restart":
        return ops.restart(ctx, params);
      case "enable":
        return ops.enable(ctx, params);
      case "add":
        return ops.add(ctx, params);
      case "remove":
        return ops.remove(ctx, params);
      case "reload":
        return ops.reload(ctx);
      case "discover":
        return ops.discover(ctx);
      case "usage":
        return ops.usage(ctx);
      case "ram":
        return ops.ram(ctx);

      default:
        return {
          content: [{
            type: "text",
            text: `Unknown operation: ${operation}. Use mcpm(operation="help") to see available operations.`
          }]
        };
    }
  }
);

// ============ Main ============

// Kill child processes on exit to prevent orphans
function cleanup(): void {
  for (const [name, server] of Object.entries(RUNNING)) {
    if (server.process) {
      try { server.process.kill(); } catch {}
    }
  }
  if (idleCheckTimer) clearInterval(idleCheckTimer);
}
process.on("exit", cleanup);
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("SIGINT", () => { cleanup(); process.exit(0); });

async function main() {
  log("=== MCP Manager v2.0 starting ===");

  loadEnv(BASE_DIR);
  const serverCount = loadServersConfig();
  log(`Loaded ${serverCount} servers from ${SERVERS_FILE}`);

  // Auto-detect project context from cwd
  detectProjectContext();
  const hooksCount = loadHooks(BASE_DIR);
  log(`Loaded ${hooksCount} hooks from hooks.yaml`);

  // Connect transport FIRST so Claude doesn't timeout
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP Manager connected to Claude");

  // Start idle server checker
  startIdleChecker();

  // Auto-start servers in background
  autoStartServers().catch((e) => log(`Auto-start error: ${e.message}`));
}

main().catch(console.error);
