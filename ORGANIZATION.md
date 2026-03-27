# MCP Server Organization Framework

## Central Repository Structure

All MCP servers live in ONE central folder. Set via environment variable:

```bash
export MCP_REPO_PATH="$HOME/mcp-servers"  # Default
```

Structure:
```
$MCP_REPO_PATH/
├── mcp-manager/        # This router (required)
├── archive/            # Archived/old servers (never delete)
├── mcp-wiki-lite/
├── mcp-v1-lite/
└── [other servers]/
```

## Rules

1. **One location** - All servers in MCP_REPO_PATH, no duplicates in projects
2. **Never delete** - Always `mv` to archive/ with date suffix
3. **Per-project config** - Projects use .mcp.json to reference servers by name
4. **Central logging** - All actions logged to mcp-manager.log

## Project Setup

Each project needs only `.mcp.json`:

```json
{
  "mcpServers": {
    "mcp-manager": {
      "command": "node",
      "args": ["$MCP_REPO_PATH/mcp-manager/build/index.js"],
      "servers": ["wiki-lite", "v1-lite", "trello-lite"]
    }
  }
}
```

## Installing New Servers

```bash
mcpm add <name> --command=<cmd> --args=[args]
```

mcpm will:
1. Create folder in MCP_REPO_PATH
2. Log action to mcp-manager.log
3. Update servers.yaml

## Migrating Existing Servers

If you have servers scattered in project folders:

```bash
mcpm organize
```

This will:
1. Scan for MCP servers in common locations
2. Show duplicates and recommend which to keep
3. Move servers to MCP_REPO_PATH (archive duplicates)
4. Update project .mcp.json files
5. Log all actions

## Logging

All file operations logged to `$MCP_REPO_PATH/mcp-manager/mcp-manager.log`:

- Log rotation: 500 MB max, keeps 5 files
- Format: `[timestamp] [ACTION] message`
- Actions: MOVE, ARCHIVE, CREATE, UPDATE, CLAUDE_RUN

## Claude Integration

mcpm can invoke Claude for complex organization:

```bash
mcpm organize --claude
```

This runs `claude -p "organize mcp servers"` with output logged.
