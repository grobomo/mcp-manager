/**
 * mcpm registry operations - add, remove, reload, discover
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { McpmContext, OperationResult, McpmParams, ServerConfig } from "../types.js";

export async function add(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;
  const command = params.command;

  if (!serverName) {
    return { content: [{ type: "text", text: "Error: server parameter required" }] };
  }
  if (!command) {
    return { content: [{ type: "text", text: "Error: command parameter required" }] };
  }

  if (serverName in ctx.SERVERS) {
    return { content: [{ type: "text", text: `Server already exists: ${serverName}. Use remove first.` }] };
  }

  ctx.SERVERS[serverName] = {
    name: serverName,
    command: command,
    args: params.args || [],
    description: params.description || "",
    env: params.env || {},
    enabled: true,
    auto_start: params.auto_start || false,
    tags: params.tags || [],
  };

  ctx.saveServersConfig();
  return { content: [{ type: "text", text: `Added server: ${serverName}` }] };
}

export async function remove(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;
  if (!serverName) {
    return { content: [{ type: "text", text: "Error: server parameter required" }] };
  }

  if (!(serverName in ctx.SERVERS)) {
    return { content: [{ type: "text", text: `Unknown server: ${serverName}` }] };
  }

  if (serverName in ctx.RUNNING) {
    ctx.stopServer(serverName);
  }

  delete ctx.SERVERS[serverName];
  ctx.saveServersConfig();
  return { content: [{ type: "text", text: `Removed server: ${serverName}` }] };
}

export async function reload(ctx: McpmContext): Promise<OperationResult> {
  // Actually reload servers.yaml
  const oldCount = Object.keys(ctx.SERVERS).length;

  try {
    const count = ctx.loadServersConfig();
    const runningCount = Object.keys(ctx.RUNNING).length;
    return {
      content: [{
        type: "text",
        text: `Reloaded config: ${count} servers (was ${oldCount}), ${runningCount} running. New timeout/config values will apply to next server start.`
      }]
    };
  } catch (e: any) {
    return { content: [{ type: "text", text: `Failed to reload: ${e.message}` }] };
  }
}

interface DiscoveredServer {
  name: string;
  type: "node" | "python" | "unknown";
  command: string;
  args: string[];
  description: string;
  hasMetadata: boolean;
  entryPoint: string | null;
}

function discoverNewServers(ctx: McpmContext): DiscoveredServer[] {
  const MCP_ROOT = join(ctx.BASE_DIR, "..");
  const discovered: DiscoveredServer[] = [];

  if (!existsSync(MCP_ROOT)) return discovered;

  try {
    const entries = readdirSync(MCP_ROOT, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("mcp-")) continue;
      if (entry.name === "mcp-manager") continue;

      const folderPath = join(MCP_ROOT, entry.name);
      const hasMetadata = existsSync(join(folderPath, "metadata.yaml"));

      const packageJsonPath = join(folderPath, "package.json");
      const serverPyPath = join(folderPath, "server.py");

      let type: "node" | "python" | "unknown" = "unknown";
      let command = "";
      let args: string[] = [];
      let description = "";
      let entryPoint: string | null = null;

      if (existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
          type = "node";
          description = pkg.description || "";

          if (pkg.main) {
            entryPoint = join(folderPath, pkg.main);
            command = "node";
            args = [entryPoint];
          } else if (pkg.bin) {
            const binName = Object.keys(pkg.bin)[0];
            if (binName) {
              entryPoint = join(folderPath, pkg.bin[binName]);
              command = "node";
              args = [entryPoint];
            }
          }

          if (entryPoint && !existsSync(entryPoint)) {
            const cjsVariant = entryPoint.replace(/\.js$/, ".cjs");
            if (existsSync(cjsVariant)) {
              entryPoint = cjsVariant;
              args = [entryPoint];
            } else if (pkg.scripts?.build) {
              entryPoint = null;
            }
          }
        } catch {}
      } else if (existsSync(serverPyPath)) {
        type = "python";
        entryPoint = serverPyPath;
        command = "uv";
        args = ["run", "--with", "mcp", "python", serverPyPath];

        try {
          const pyContent = readFileSync(serverPyPath, "utf-8");
          const docMatch = pyContent.match(/^"""([^"]+)"""/m) ||
                          pyContent.match(/^'''([^']+)'''/m);
          if (docMatch) {
            description = docMatch[1].trim().split("\n")[0];
          }
        } catch {}
      }

      discovered.push({
        name: entry.name,
        type,
        command,
        args,
        description,
        hasMetadata,
        entryPoint,
      });
    }
  } catch (e: any) {
    ctx.log(`Error scanning MCP folders: ${e.message}`);
  }

  return discovered;
}

function createMetadataYaml(ctx: McpmContext, server: DiscoveredServer): boolean {
  const MCP_ROOT = join(ctx.BASE_DIR, "..");
  const metadataPath = join(MCP_ROOT, server.name, "metadata.yaml");

  if (existsSync(metadataPath)) return false;

  const metadata = {
    name: server.name,
    description: server.description || `${server.name} MCP server`,
    version: "1.0.0",
    source: "cloned",
    status: server.entryPoint ? "active" : "needs_build",
    tags: [] as string[],
    tokens: "~2000",
    maintainer: "joel",
    used_by: [],
  };

  if (server.type === "node") metadata.tags.push("node");
  if (server.type === "python") metadata.tags.push("python");

  try {
    writeFileSync(metadataPath, stringifyYaml(metadata));
    return true;
  } catch {
    return false;
  }
}

function registerNewServer(ctx: McpmContext, server: DiscoveredServer): boolean {
  if (!server.entryPoint || !server.command) return false;

  const shortName = server.name.replace(/^mcp-/, "");

  if (shortName in ctx.SERVERS || server.name in ctx.SERVERS) return false;

  const config: ServerConfig = {
    name: shortName,
    description: server.description || `${server.name} server`,
    command: server.command,
    args: server.args,
    enabled: true,
    auto_start: false,
    tags: [server.type],
  };

  if (server.type === "python") {
    config.startup_delay = 3000;
  }

  ctx.SERVERS[shortName] = config;
  return true;
}

export async function discover(ctx: McpmContext): Promise<OperationResult> {
  const discovered = discoverNewServers(ctx);
  let created = 0;
  let registered = 0;

  for (const server of discovered) {
    if (!server.hasMetadata) {
      if (createMetadataYaml(ctx, server)) {
        created++;
        ctx.log(`  Created metadata.yaml for ${server.name}`);
      }
    }

    if (registerNewServer(ctx, server)) {
      registered++;
      ctx.log(`  Registered ${server.name} in servers.yaml`);
    }
  }

  if (registered > 0) {
    ctx.saveServersConfig();
  }

  const lines = ["# MCP Server Discovery", ""];
  lines.push(`Found ${discovered.length} MCP server folders:`);
  lines.push("");

  for (const srv of discovered) {
    const statusIcon = srv.entryPoint ? "[OK]" : "[NEEDS BUILD]";
    const shortName = srv.name.replace(/^mcp-/, "");
    const regStatus = (shortName in ctx.SERVERS) ? "registered" : "not registered";
    lines.push(`  ${srv.name} (${srv.type}) ${statusIcon}`);
    lines.push(`    Status: ${regStatus}`);
  }

  lines.push("");
  lines.push(`Created ${created} metadata.yaml files`);
  lines.push(`Registered ${registered} new servers`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
