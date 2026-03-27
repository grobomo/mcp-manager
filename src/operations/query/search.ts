/**
 * mcpm search - Universal search across servers, tools, and descriptions
 */

import type { McpmContext, OperationResult, McpmParams } from "../types.js";

export async function search(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const query = params.query;
  if (!query) {
    return { content: [{ type: "text", text: "Error: query parameter required for search" }] };
  }

  const searchTerm = query.toLowerCase();
  const shouldAutoStart = params.auto_start === true;
  const cache = ctx.loadCapabilitiesCache();

  ctx.log(`SEARCH query="${searchTerm}" auto_start=${shouldAutoStart}`);

  interface Match {
    type: "server" | "tool";
    server: string;
    serverDescription: string;
    tool?: string;
    toolDescription?: string;
    running: boolean;
  }

  const matches: Match[] = [];

  for (const [serverName, config] of Object.entries(ctx.SERVERS)) {
    if (config.enabled === false) continue;

    const serverInfo = cache[serverName];
    const serverDesc = config.description || serverInfo?.description || "";
    const isRunning = serverName in ctx.RUNNING;

    // Search server name and description
    const serverNameMatch = serverName.toLowerCase().includes(searchTerm);
    const serverDescMatch = serverDesc.toLowerCase().includes(searchTerm);
    const tagsMatch = (config.tags || []).some(t => t.toLowerCase().includes(searchTerm));

    if (serverNameMatch || serverDescMatch || tagsMatch) {
      matches.push({
        type: "server",
        server: serverName,
        serverDescription: serverDesc,
        running: isRunning,
      });
    }

    // Search tools
    const tools = serverInfo?.tools || [];
    for (const tool of tools) {
      const nameMatch = tool.name.toLowerCase().includes(searchTerm);
      const descMatch = (tool.description || "").toLowerCase().includes(searchTerm);

      if (nameMatch || descMatch) {
        matches.push({
          type: "tool",
          server: serverName,
          serverDescription: serverDesc,
          tool: tool.name,
          toolDescription: (tool.description || "").slice(0, 80),
          running: isRunning,
        });
      }
    }
  }

  ctx.log(`SEARCH found ${matches.length} matches`);

  if (matches.length === 0) {
    return { content: [{ type: "text", text: `No matches for "${query}"` }] };
  }

  // Auto-start stopped servers if requested
  const stoppedServers = [...new Set(matches.filter(m => !m.running).map(m => m.server))];
  const startedServers: string[] = [];

  if (shouldAutoStart && stoppedServers.length > 0) {
    for (const serverName of stoppedServers) {
      ctx.log(`SEARCH auto-starting ${serverName}...`);
      const [success, msg] = await ctx.startServer(serverName);
      if (success) {
        startedServers.push(serverName);
        matches.forEach(m => { if (m.server === serverName) m.running = true; });
      } else {
        ctx.log(`SEARCH failed to start ${serverName}: ${msg}`);
      }
    }
  }

  // Format output
  const lines = [`# Search: "${query}"`, `Found ${matches.length} matches:`, ""];

  if (startedServers.length > 0) {
    lines.push(`Auto-started: ${startedServers.join(", ")}`, "");
  }

  // Group by server
  const byServer: Record<string, Match[]> = {};
  for (const m of matches) {
    if (!byServer[m.server]) byServer[m.server] = [];
    byServer[m.server].push(m);
  }

  for (const [serverName, serverMatches] of Object.entries(byServer)) {
    const status = serverMatches[0].running ? "RUNNING" : "STOPPED";
    const desc = serverMatches[0].serverDescription;
    lines.push(`## ${serverName} [${status}]`);
    if (desc) lines.push(`   ${desc}`);

    // Show tool matches
    const toolMatches = serverMatches.filter(m => m.type === "tool");
    if (toolMatches.length > 0) {
      lines.push("   Tools:");
      for (const t of toolMatches) {
        lines.push(`     - ${t.tool}: ${t.toolDescription}`);
      }
    }
    lines.push("");
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
