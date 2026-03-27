/**
 * mcpm list_servers - List all servers with status
 */

import { readdirSync, existsSync } from "fs";
import { join } from "path";
import type { McpmContext, OperationResult } from "../types.js";

export async function listServers(ctx: McpmContext): Promise<OperationResult> {
  const cache = ctx.loadCapabilitiesCache();
  const lines = ["# MCP Servers", ""];

  // Show project context if filtering is active
  if (ctx.projectName && ctx.allowedServers) {
    lines.push(`Project: ${ctx.projectName}`);
    lines.push(`Allowed: ${ctx.allowedServers.join(", ")}`);
    lines.push("");
  }

  // Group servers by status (filtered by allowedServers)
  const running: string[] = [];
  const stopped: string[] = [];
  const disabled: string[] = [];

  for (const name of Object.keys(ctx.SERVERS).sort()) {
    // Skip servers not in allowedServers list
    if (!ctx.isServerAllowed(name)) continue;

    const config = ctx.SERVERS[name];
    if (name in ctx.RUNNING) {
      running.push(name);
    } else if (config.enabled === false) {
      disabled.push(name);
    } else {
      stopped.push(name);
    }
  }

  // Running servers
  if (running.length > 0) {
    lines.push("## RUNNING");
    for (const name of running) {
      const config = ctx.SERVERS[name];
      const cached = cache[name];
      const tools = ctx.TOOLS[name] || cached?.tools || [];
      const toolCount = tools.length;
      lines.push(`  ${name} (${toolCount} tools) - ${config.description || ""}`);
    }
    lines.push("");
  }

  // Stopped but enabled
  if (stopped.length > 0) {
    lines.push("## STOPPED");
    for (const name of stopped) {
      const config = ctx.SERVERS[name];
      lines.push(`  ${name} - ${config.description || ""}`);
    }
    lines.push("");
  }

  // Disabled
  if (disabled.length > 0) {
    lines.push("## DISABLED");
    for (const name of disabled) {
      const config = ctx.SERVERS[name];
      lines.push(`  ${name} - ${config.description || ""}`);
    }
    lines.push("");
  }

  const totalAllowed = running.length + stopped.length + disabled.length;
  const totalAll = Object.keys(ctx.SERVERS).length;
  if (ctx.allowedServers) {
    lines.push(`Showing: ${totalAllowed}/${totalAll} servers | ${running.length} running | ${stopped.length} stopped | ${disabled.length} disabled`);
  } else {
    lines.push(`Total: ${totalAll} servers | ${running.length} running | ${stopped.length} stopped | ${disabled.length} disabled`);
  }

  // Show unregistered servers (only if no project filtering)
  if (!ctx.allowedServers) {
    const MCP_ROOT = join(ctx.BASE_DIR, "..");
    const folders = existsSync(MCP_ROOT)
      ? readdirSync(MCP_ROOT).filter((f: string) =>
          f.startsWith("mcp-") &&
          f !== "mcp-manager" &&
          existsSync(join(MCP_ROOT, f, "metadata.yaml"))
        )
      : [];
    const registeredNames = Object.keys(ctx.SERVERS).map(n => `mcp-${n}`);
    const unregistered = folders.filter((f: string) => !registeredNames.includes(f) && !(f in ctx.SERVERS));

    if (unregistered.length > 0) {
      lines.push("");
      lines.push("## UNREGISTERED (run discover to add)");
      for (const folder of unregistered) {
        const meta = ctx.readServerMetadata(folder);
        if (meta) {
          lines.push(`  ${folder} - ${meta.description || "no description"}`);
        }
      }
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
