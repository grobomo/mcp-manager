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
- **Auto-Stop** - Idle servers stop after 1 hour to save memory (configurable)
- **Health Checks** - Detects crashed stdio processes and unreachable HTTP servers, auto-restarts
- **Call Metrics** - Per-server call counts, errors, and latency tracking
- **Capabilities Caching** - See available tools even when servers are stopped
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

defaults:
  timeout: 30
  retry_count: 3
  health_check_interval: 60
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
| `idle_timeout` | int | 300000 | Auto-stop after idle (ms) |
| `startup_delay` | int | 0 | Wait before initializing (ms) |
| `env` | dict | {} | Environment variables |
| `tags` | list | [] | Categorization tags |
| `keywords` | list | [] | Auto-start trigger keywords |

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

## Auto-Stop Idle Servers

Servers automatically stop after 5 minutes of inactivity to save memory.

**Configuration:**

```yaml
defaults:
  idle_timeout: 300000   # 5 minutes (default for all servers)

servers:
  wiki-lite:
    idle_timeout: 600000   # 10 minutes for this server
    tags:
      - no_auto_stop       # Never auto-stop this server
```

**Check status:**

```
mcpm(operation="status")
```

Shows idle time and countdown for each running server.

---

## Project Structure

```
mcp-manager/
|-- src/                    # TypeScript source
|   |-- index.ts            # Main server entry point
|   |-- operations/         # Operation handlers
|       |-- query/          # list_servers, search, details, tools, status, help
|       |-- call/           # call (proxy to backend)
|       |-- admin/          # start, stop, enable, add, remove, reload, discover
|-- build/                  # Compiled JavaScript
|-- managed-servers/        # Bundled MCP servers (optional)
|-- servers.yaml            # Server registry
|-- setup.py                # Installation script
|-- package.json            # Node.js dependencies
|-- README.md               # This file
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
