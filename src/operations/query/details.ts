/**
 * mcpm details - Full info on one server
 */

import type { McpmContext, OperationResult, McpmParams } from "../types.js";

export async function details(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;
  if (!serverName) {
    return { content: [{ type: "text", text: "Error: server parameter required for details" }] };
  }

  const config = ctx.SERVERS[serverName];
  if (!config) {
    return { content: [{ type: "text", text: `Unknown server: ${serverName}` }] };
  }

  const cache = ctx.loadCapabilitiesCache();
  const cached = cache[serverName];
  const isRunning = serverName in ctx.RUNNING;
  const running = isRunning ? ctx.RUNNING[serverName] : null;

  const lines = [`# ${serverName}`, ""];

  // Status
  let status = "STOPPED";
  if (isRunning) status = "RUNNING";
  else if (config.enabled === false) status = "DISABLED";
  lines.push(`Status: ${status}`);
  lines.push(`Description: ${config.description || "(none)"}`);
  lines.push("");

  // Config
  lines.push("## Configuration");
  if (config.url) {
    lines.push(`  Transport: HTTP`);
    lines.push(`  URL: ${config.url}`);
  } else {
    lines.push(`  Transport: stdio`);
    lines.push(`  Command: ${config.command || "(none)"}`);
    if (config.args && config.args.length > 0) {
      lines.push(`  Args: ${config.args.join(" ")}`);
    }
  }
  if (config.tags && config.tags.length > 0) {
    lines.push(`  Tags: ${config.tags.join(", ")}`);
  }
  lines.push(`  Auto-start: ${config.auto_start ? "yes" : "no"}`);
  lines.push(`  Timeout: ${config.timeout || 60000}ms`);
  lines.push(`  Idle timeout: ${config.idle_timeout || 300000}ms`);
  lines.push("");

  // Runtime info if running
  if (running) {
    lines.push("## Runtime");
    lines.push(`  Started: ${running.startedAt}`);
    const idleSeconds = Math.round((Date.now() - running.lastActivity) / 1000);
    lines.push(`  Idle: ${idleSeconds}s`);
    if (running.process) {
      lines.push(`  PID: ${running.process.pid}`);
    }
    if (running.metadata?.cdpPort) {
      lines.push(`  CDP Port: ${running.metadata.cdpPort}`);
    }
    lines.push("");
  }

  // Tools
  const tools = ctx.TOOLS[serverName] || cached?.tools || [];
  lines.push(`## Tools (${tools.length})`);
  if (tools.length === 0) {
    lines.push("  (no tools cached - start server to discover)");
  } else {
    for (const tool of tools) {
      const desc = typeof tool.description === "string"
        ? tool.description.slice(0, 60)
        : "";
      lines.push(`  - ${tool.name}: ${desc}`);
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
