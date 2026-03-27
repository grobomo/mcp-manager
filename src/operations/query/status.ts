/**
 * mcpm status - System health and diagnostics
 */

import { execSync } from "child_process";
import type { McpmContext, OperationResult } from "../types.js";

const DEFAULT_IDLE_TIMEOUT = 300000;

function getProcessMemoryMB(pid: number): number | null {
  try {
    if (process.platform === "win32") {
      const output = execSync(
        `wmic process where ProcessId=${pid} get WorkingSetSize 2>nul`,
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      const match = output.match(/\d+/);
      if (!match) return null;
      return Math.round(parseInt(match[0], 10) / 1024 / 1024);
    } else {
      const output = execSync(`ps -o rss= -p ${pid}`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return Math.round(parseInt(output, 10) / 1024);
    }
  } catch {
    return null;
  }
}

function formatBytes(mb: number | null): string {
  if (mb === null) return "?";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${mb}MB`;
}

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

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
