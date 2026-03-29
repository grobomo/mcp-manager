/**
 * MCP Protocol transport layer — sends JSON-RPC requests over stdio or HTTP.
 */

import { createInterface } from "readline";
import type { RunningServer, Tool, PendingRequest } from "./operations/types.js";

let logFn: (message: string) => void = () => {};

/** Set the logger function (call once at startup) */
export function setTransportLogger(fn: (message: string) => void): void {
  logFn = fn;
}

/**
 * Send a JSON-RPC request to a running MCP server (HTTP or stdio).
 */
export async function sendRequest(
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
        logFn(`  [stdout] ${line}`);
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

export async function initializeServer(server: RunningServer, timeout: number): Promise<any> {
  return sendRequest(timeout, server, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp-manager", version: "2.1.0" },
  });
}

export async function listServerTools(server: RunningServer, timeout: number): Promise<Tool[]> {
  const result = await sendRequest(timeout, server, "tools/list");
  return result?.tools || [];
}

export async function callServerTool(
  timeout: number,
  server: RunningServer,
  toolName: string,
  args: any
): Promise<any> {
  return sendRequest(timeout, server, "tools/call", { name: toolName, arguments: args });
}
