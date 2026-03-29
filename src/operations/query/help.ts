/**
 * mcpm help - Show available operations
 */

import type { OperationResult } from "../types.js";

export async function help(): Promise<OperationResult> {
  const text = `# mcpm - MCP Server Manager

## Query Operations (read-only)
  list_servers   List all servers with status
  search         Search servers, tools, descriptions
                 params: query, auto_start?
  details        Full info on one server
                 params: server
  tools          List tools for a server (or all running)
                 params: server?
  status         System health, memory, diagnostics
  logs           Tail recent log entries
                 params: server?
  help           Show this help

## Call Operation (proxy to backend)
  call           Execute tool on backend server
                 params: server, tool, arguments?

## Admin Operations (modify state)
  start          Start a server
                 params: server
  stop           Stop a server
                 params: server
  restart        Restart a server
                 params: server
  enable         Enable a server
                 params: server, enabled
  add            Register new server
                 params: server, command, args?, description?, env?, tags?, auto_start?
  remove         Unregister a server
                 params: server
  reload         Reload servers.yaml config
  discover       Scan mcp/ folder for new servers
  usage          Show which projects use which servers
  ram            Detailed RAM usage by server

## Examples
  mcpm(operation="list_servers")
  mcpm(operation="search", query="wiki")
  mcpm(operation="details", server="v1-lite")
  mcpm(operation="start", server="wiki-lite")
  mcpm(operation="call", server="wiki-lite", tool="wiki_search", arguments={"query": "API"})
`;

  return { content: [{ type: "text", text }] };
}
