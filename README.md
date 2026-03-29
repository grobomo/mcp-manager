---
title: mcp-manager
page_id: 1994276157
space_key: ~622a1696db58c100687da202
parent_id: 1995637406
---

# MCP Manager

Dynamic MCP Server Router - manages multiple MCP servers through a single proxy connection. Start/stop servers on demand without restarting Claude.

**GitHub:** https://github.com/grobomo/mcp-manager

---

## Quick Start

```bash
git clone https://github.com/grobomo/mcp-manager.git
cd mcp-manager
python setup.py
```

That's it. Setup builds the project, creates `servers.yaml`, configures `.mcp.json`, and verifies the server starts. Open a new Claude Code session to begin.

---

## Features

- **Single Tool Interface** - One `mcpm` tool with operations (token-efficient: ~300 tokens vs ~3000)
- **Dynamic Loading** - Start/stop MCP servers on demand without restarting Claude
- **On-Demand Start** - Servers start automatically when tools are called
- **Crash Recovery** - Auto-restarts crashed servers and retries failed calls once
- **Auto-Stop** - Idle servers stop after 1 hour to save memory (configurable)
- **Health Checks** - Detects crashed stdio processes and unreachable HTTP servers, auto-restarts
- **Call Metrics** - Per-server call counts, errors, and latency tracking
- **Binary Filtering** - Intercepts base64 images/resources, saves to temp files, returns paths
- **Blueprint Middleware** - Auto-enables browser automation with client_id injection
- **Capabilities Caching** - See available tools even when servers are stopped
- **Hooks System** - Trigger actions after tool calls via hooks.yaml config
- **Per-Project Filtering** - Restrict server access per project via `.mcp.json` allowedServers
- **Cross-Platform** - Works on Windows, macOS, and Linux

## How It Works

```
Claude Code
    |
    v
mcp-manager (single proxy)
    |
    +-- mcpm(operation, server, tool, arguments)
    |
    v
Backend MCP Servers (started on demand)
  - browser automation
  - API wrappers
  - custom tools
```

1. Claude connects only to mcp-manager
2. When you call a tool, mcp-manager routes to the correct backend server
3. Servers start automatically if stopped, stop automatically when idle

---

## The mcpm Tool

All operations go through a single `mcpm` tool:

```
mcpm(operation="<op>", server="<name>", ...)
```

### Operations

| Operation | Description | Parameters |
|-----------|-------------|------------|
| `list_servers` | List all servers with status | - |
| `search` | Search servers/tools by keyword | `query` |
| `details` | Full info on one server | `server` |
| `tools` | List tools from server(s) | `server` (optional) |
| `status` | System health, memory, PIDs | - |
| `help` | Show available operations | - |
| `call` | Execute tool on backend server | `server`, `tool`, `arguments` |
| `start` | Start a server | `server` |
| `stop` | Stop a server | `server` |
| `restart` | Restart a server | `server` |
| `enable` | Enable/disable a server | `server`, `enabled` |
| `add` | Register a new server | `server`, `command`, `args`, `description` |
| `remove` | Unregister a server | `server` |
| `reload` | Reload servers.yaml | - |
| `discover` | Scan for unregistered servers | - |
| `usage` | Project usage metrics | - |
| `ram` | Memory dashboard | - |

### Examples

```python
# List servers
mcpm(operation="list_servers")

# Start a server
mcpm(operation="start", server="browser")

# Call a tool (auto-starts server if needed)
mcpm(operation="call", server="wiki-lite", tool="wiki_search", arguments={"query": "API docs"})

# Add a new server
mcpm(operation="add", server="my-server", command="node", args=["./server.js"], description="My custom server")

# Check memory usage
mcpm(operation="ram")
```

---

## Installation

### Prerequisites

- **Node.js** 18+ (for mcp-manager itself)
- **npm** 9+
- **Python** 3.10+ (for setup script and Python-based servers)

### Steps

```bash
# 1. Clone and run setup (handles everything)
git clone https://github.com/grobomo/mcp-manager.git
cd mcp-manager
python setup.py

# 2. Open a new Claude Code session
```

Setup automatically:
- Installs npm dependencies and builds TypeScript
- Creates `servers.yaml` from the example template
- Adds mcp-manager to `~/.mcp.json` (global, works in all projects)
- Adds usage instructions to `~/.claude/CLAUDE.md`
- Verifies the server starts correctly

### Setup Options

```bash
python setup.py              # Full setup (build + configure + verify)
python setup.py --check      # Check prerequisites only
python setup.py --migrate    # Migrate servers from .mcp.json to servers.yaml
```

---

## Configuration

### servers.yaml

Register your MCP servers in `servers.yaml`:

```yaml
servers:
  # Local stdio server (Node.js)
  my-node-server:
    description: My custom Node.js server
    command: node
    args:
      - ./servers/my-server/dist/index.js
    enabled: true
    auto_start: false
    idle_timeout: 300000  # 5 minutes

  # Local stdio server (Python)
  my-python-server:
    description: My Python server
    command: python
    args:
      - ./servers/my-server/server.py
    enabled: true
    auto_start: false

  # NPX server (always latest)
  some-mcp:
    description: Some MCP from npm
    command: npx
    args:
      - some-mcp@latest
    enabled: true
    auto_start: false

  # Remote HTTP server
  remote-api:
    description: Remote API server
    url: https://api.example.com/mcp
    enabled: true
    auto_start: false
```

### Server Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `description` | string | - | Human-readable description |
| `command` | string | - | Command to run (node, python, npx, etc.) |
| `args` | list | [] | Command arguments |
| `url` | string | - | HTTP/WebSocket URL (alternative to command) |
| `enabled` | bool | true | Whether server is available |
| `auto_start` | bool | false | Start automatically with Claude |
| `idle_timeout` | int | 3600000 | Auto-stop after idle (ms, default 1 hour) |
| `startup_delay` | int | 2000 | Wait before initializing (ms) |
| `env` | dict | {} | Environment variables |
| `timeout` | int | 60000 | Request timeout (ms) |
| `tags` | list | [] | Categorization tags (use `no_auto_stop` to exempt from idle timeout) |

### Path Conventions

Use relative paths from the mcp-manager directory for portability:

```yaml
# Good - relative path
args:
  - ./managed-servers/my-server/server.py

# Avoid - absolute path (not portable)
args:
  - /home/user/mcp-manager/managed-servers/my-server/server.py
```

---

## Reliability

### Auto-Stop Idle Servers

Servers automatically stop after 1 hour of inactivity to save memory. Health checks run every 60 seconds to detect crashed processes and unreachable HTTP servers.

```yaml
servers:
  wiki-lite:
    idle_timeout: 600000   # 10 minutes (default: 3600000 = 1 hour)
    tags:
      - no_auto_stop       # Never auto-stop this server
```

### Crash Recovery

If a tool call fails due to a server crash (stdin write failure, EPIPE, stream errors), mcp-manager automatically:

1. Stops the dead server
2. Restarts it
3. Retries the call once

No configuration needed - this is always active for enabled servers.

### Health Checks

Every 60 seconds, mcp-manager checks all running servers:

- **Stdio servers** - Detects exited processes, cleans up resources, auto-restarts if `auto_start: true`
- **HTTP servers** - Sends a ping request, removes unreachable servers, auto-restarts if configured

Check server health with:

```
mcpm(operation="status")
```

---

## Hooks

Hooks trigger actions after tool calls. Configure in `hooks.yaml`:

```yaml
defaults:
  enabled: true
  async: true
  timeout: 5000

hooks:
  # Pattern matches tool names (* = wildcard, prefix* = prefix match)
  browser_navigate:
    target_server: metrics-server
    target_tool: log_event
    result_contains: "success"      # Only trigger if result contains this
    extract:
      url: args.url                 # Extract from call arguments
      status: "regex:HTTP (\\d+)"   # Extract from result via regex
      source: "literal:${server}"   # Variable substitution
      summary: "result_summary:100" # First 100 chars of result
```

### Extract Specs

| Spec | Description | Example |
|------|-------------|---------|
| `args.<field>` | Value from call arguments | `args.query` |
| `regex:<pattern>` | Capture group 1 from result | `regex:id=(\\d+)` |
| `literal:<value>` | Literal with `${server}`, `${tool}` substitution | `literal:${server}` |
| `result_summary:<n>` | First N chars of result | `result_summary:200` |
| `result` | Full result text | `result` |

---

## Blueprint Middleware

Browser automation via `blueprint-extra` has built-in middleware:

- **Auto-inject `client_id`** on `enable` calls (uses project name or `claude-code`)
- **Auto-enable** when calling `browser_*` tools if blueprint isn't enabled yet
- **State tracking** across enable/disable calls

No configuration needed - active whenever `blueprint-extra` is registered in `servers.yaml`.

---

## Per-Project Filtering

Restrict which servers a project can access via `.mcp.json`:

```json
{
  "mcpServers": {
    "mcp-manager": {
      "command": "node",
      "args": ["path/to/mcp-manager/build/index.js"],
      "allowedServers": ["wiki-lite", "v1-lite"]
    }
  }
}
```

When `allowedServers` is set, only those servers appear in `list_servers` and can be called. Other servers are blocked with a clear error message.

---

## Project Structure

```
mcp-manager/
|-- src/
|   |-- index.ts            # Main server, transport, idle checker, config
|   |-- utils.ts            # Shared utilities (sanitizeLog, paths, memory)
|   |-- hooks.ts            # Post-call hook system
|   |-- metrics.ts          # Per-server call metrics
|   |-- binary-filter.ts    # Base64 image/resource interception
|   |-- operations/
|       |-- types.ts        # Shared types (ServerConfig, RunningServer, etc.)
|       |-- index.ts        # Operation barrel exports
|       |-- query/          # list_servers, search, details, tools, status, help
|       |-- call/           # call + middleware (blueprint auto-enable)
|       |-- admin/          # lifecycle, registry (add/remove/discover), usage/ram
|-- tests/                  # 93 tests (node:test + tsx)
|-- build/                  # Compiled JavaScript (tsup ESM)
|-- servers.yaml            # Server registry (gitignored)
|-- hooks.yaml              # Hook config (gitignored)
|-- setup.py                # Installation script
```

---

## Troubleshooting

### Server won't start

1. Check prerequisites: `python setup.py --check`
2. Verify server path exists and is correct
3. Check `mcpm(operation="details", server="server-name")` for config errors
4. Look at logs in `.local/mcp-manager.log`

### Tool not found

1. Start the server: `mcpm(operation="start", server="server-name")`
2. List tools: `mcpm(operation="tools", server="server-name")`
3. Tools are cached - use `mcpm(operation="reload")` to refresh

### High memory usage

1. Check RAM: `mcpm(operation="ram")`
2. Stop unused servers: `mcpm(operation="stop", server="server-name")`
3. Reduce `idle_timeout` in servers.yaml

---

## License

MIT

## Organization

See [ORGANIZATION.md](./ORGANIZATION.md) for:
- Central repository structure
- Never-delete policy (always archive)
- Project setup with .mcp.json
- Log rotation (500MB, keep 5)
- Claude integration for organizing
