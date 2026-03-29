/**
 * mcpm status - System health and diagnostics
 */

import type { McpmContext, OperationResult } from "../types.js";
import { DEFAULT_IDLE_TIMEOUT, getProcessMemoryMB, formatBytes } from "../../utils.js";
import { formatMetrics } from "../../metrics.js";

export async function status(ctx: McpmContext): Promise<OperationResult> {
  const lines = ["# MCP Manager Status", ""];
  lines.push(`Registry: ${ctx.SERVERS_FILE}`);
  lines.push(`Total servers: ${Object.keys(ctx.SERVERS).length}`);
  lines.push(`Running: ${Object.keys(ctx.RUNNING).length}`);
  lines.push(`Total tools: ${Object.values(ctx.TOOLS).flat().length}`);
  lines.push("");

  // Memory usage
  const selfMem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  let totalMem = selfMem;
  lines.push("## Memory");
  lines.push(`  mcp-manager: ${formatBytes(selfMem)}`);

  if (Object.keys(ctx.RUNNING).length > 0) {
    lines.push("");
    lines.push("## Running Servers");
    for (const [name, info] of Object.entries(ctx.RUNNING)) {
      const idleSeconds = Math.round((Date.now() - info.lastActivity) / 1000);
      const idleTimeout = ctx.SERVERS[name]?.idle_timeout || DEFAULT_IDLE_TIMEOUT;
      const timeUntilStop = Math.round((idleTimeout - (Date.now() - info.lastActivity)) / 1000);

      let memStr = "remote";
      if (info.process?.pid) {
        const mem = getProcessMemoryMB(info.process.pid);
        if (mem !== null) {
          totalMem += mem;
          memStr = formatBytes(mem);
        }
      }

      lines.push(`  ${name}`);
      lines.push(`    Tools: ${info.toolsCount} | RAM: ${memStr}`);
      lines.push(`    Idle: ${idleSeconds}s (auto-stop in ${timeUntilStop > 0 ? timeUntilStop + 's' : 'imminent'})`);
      if (info.url) {
        lines.push(`    URL: ${info.url}`);
      } else if (info.process) {
        lines.push(`    PID: ${info.process.pid}`);
      }
    }
  }

  lines.push("");
  lines.push(`Total RAM: ${formatBytes(totalMem)}`);
  lines.push("");
  lines.push(formatMetrics());

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
