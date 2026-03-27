/**
 * mcpm tools - List tools for a server
 */

import type { McpmContext, OperationResult, McpmParams } from "../types.js";

export async function tools(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;

  // If specific server requested
  if (serverName) {
    if (!(serverName in ctx.RUNNING)) {
      return {
        content: [{
          type: "text",
          text: `Server not running: ${serverName}. Start it first with mcpm(operation="start", server="${serverName}")`
        }]
      };
    }

    const serverTools = ctx.TOOLS[serverName] || [];
    const lines = [`# ${serverName} Tools (${serverTools.length})`, ""];

    for (const tool of serverTools) {
      const desc = (tool.description || "").slice(0, 80);
      lines.push(`  - ${tool.name}`);
      if (desc) lines.push(`    ${desc}`);
    }

    if (serverTools.length === 0) {
      lines.push("  (no tools)");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  // All running servers
  const lines = ["# Available Tools", ""];
  const runningServers = Object.keys(ctx.RUNNING).sort();

  if (runningServers.length === 0) {
    lines.push("No servers running. Use mcpm(operation=\"start\", server=\"...\") to start a server.");
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  for (const srv of runningServers) {
    const serverTools = ctx.TOOLS[srv] || [];
    lines.push(`## ${srv} (${serverTools.length} tools)`);
    for (const tool of serverTools) {
      const desc = (tool.description || "").slice(0, 50);
      lines.push(`  - ${tool.name}: ${desc}`);
    }
    lines.push("");
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
