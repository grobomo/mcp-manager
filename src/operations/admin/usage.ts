/**
 * mcpm usage and ram operations
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { McpmContext, OperationResult } from "../types.js";
import { getProcessMemoryMB, formatBytes } from "../../utils.js";

function scanProjectUsage(ctx: McpmContext): Record<string, string[]> {
  const usage: Record<string, string[]> = {};
  const PROJECTS_ROOT = join(ctx.BASE_DIR, "..", "..");

  if (!existsSync(PROJECTS_ROOT)) {
    return usage;
  }

  try {
    const entries = readdirSync(PROJECTS_ROOT, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const mcpJsonPath = join(PROJECTS_ROOT, entry.name, ".mcp.json");
      if (!existsSync(mcpJsonPath)) continue;

      try {
        const content = readFileSync(mcpJsonPath, "utf-8");
        const config = JSON.parse(content);
        const servers = config.mcpServers || {};

        for (const [serverKey, serverConfig] of Object.entries(servers) as [string, any][]) {
          let mcpName: string | null = null;

          const args = serverConfig.args || [];
          for (const arg of args) {
            if (typeof arg === "string") {
              const match = arg.match(/mcp[\/\\](mcp-[^\/\\]+)/);
              if (match) {
                mcpName = match[1];
                break;
              }
            }
          }

          if (!mcpName && serverKey.startsWith("mcp-")) {
            mcpName = serverKey;
          }

          if (!mcpName) {
            const possibleName = `mcp-${serverKey}`;
            const possiblePath = join(ctx.BASE_DIR, "..", possibleName);
            if (existsSync(possiblePath)) {
              mcpName = possibleName;
            }
          }

          if (mcpName) {
            if (!usage[mcpName]) {
              usage[mcpName] = [];
            }
            if (!usage[mcpName].includes(entry.name)) {
              usage[mcpName].push(entry.name);
            }
          }
        }
      } catch {
        // Skip invalid JSON files
      }
    }
  } catch {
    // Skip if can't read directory
  }

  return usage;
}

export async function usage(ctx: McpmContext): Promise<OperationResult> {
  const usageMap = scanProjectUsage(ctx);
  const lines = ["# MCP Server Usage", ""];

  const MCP_ROOT = ctx.MCP_ROOT;
  const allServers: string[] = [];

  try {
    const entries = readdirSync(MCP_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("mcp-")) {
        allServers.push(entry.name);
      }
    }
  } catch {}

  const used: [string, string[]][] = [];
  const unused: string[] = [];

  for (const server of allServers.sort()) {
    const projects = usageMap[server];
    if (projects && projects.length > 0) {
      used.push([server, projects]);
    } else {
      unused.push(server);
    }
  }

  if (used.length > 0) {
    lines.push("## In Use");
    for (const [server, projects] of used) {
      lines.push(`  ${server}`);
      for (const proj of projects.sort()) {
        lines.push(`    - ${proj}`);
      }
    }
    lines.push("");
  }

  if (unused.length > 0) {
    lines.push("## Not Used");
    for (const server of unused) {
      lines.push(`  ${server}`);
    }
    lines.push("");
  }

  lines.push(`Total: ${allServers.length} servers, ${used.length} in use, ${unused.length} not used`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

export async function ram(ctx: McpmContext): Promise<OperationResult> {
  const lines: string[] = [];
  const WIDTH = 52;

  const selfMem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  let totalMem = selfMem;

  const serverData: { name: string; ram: number | null; tools: string[]; isHttp?: boolean }[] = [];

  for (const name of Object.keys(ctx.RUNNING).sort()) {
    const server = ctx.RUNNING[name];
    const pid = server.process?.pid;
    const mem = pid ? getProcessMemoryMB(pid) : null;
    if (mem !== null) totalMem += mem;
    const tools = (ctx.TOOLS[name] || []).map((t) => t.name);
    const isHttp = !!server.url;
    serverData.push({ name, ram: mem, tools, isHttp });
  }

  lines.push("MCP Servers");
  lines.push("");

  const mgrLabel = "mcp-manager (this)";
  const mgrMem = formatBytes(selfMem);
  const mgrPad = WIDTH - mgrLabel.length - 4 - mgrMem.length;
  lines.push(`├── ${mgrLabel}${".".repeat(Math.max(1, mgrPad))}${mgrMem}`);

  for (let i = 0; i < serverData.length; i++) {
    const srv = serverData[i];
    const isLast = i === serverData.length - 1;
    const prefix = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    const transportNote = srv.isHttp ? " [HTTP]" : "";
    const serverLabel = `${srv.name}${transportNote} (${srv.tools.length} tools)`;
    const ramStr = srv.isHttp ? "remote" : formatBytes(srv.ram);
    const padding = WIDTH - serverLabel.length - prefix.length - ramStr.length;
    lines.push(`${prefix}${serverLabel}${".".repeat(Math.max(1, padding))}${ramStr}`);

    for (let j = 0; j < srv.tools.length; j++) {
      const toolName = srv.tools[j];
      const isLastTool = j === srv.tools.length - 1;
      const toolPrefix = isLastTool ? "└── " : "├── ";
      lines.push(`${childPrefix}${toolPrefix}${toolName}`);
    }
  }

  if (serverData.length === 0) {
    lines.push("└── (no backend servers running)");
  }

  lines.push("");
  const totalLabel = "Total RAM";
  const totalStr = formatBytes(totalMem);
  const totalPad = WIDTH - totalLabel.length - totalStr.length;
  lines.push(`${totalLabel}${".".repeat(Math.max(1, totalPad))}${totalStr}`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
