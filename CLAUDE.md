# mcp-manager

Dynamic MCP Server Proxy Router - manages and routes to other MCP servers.

## Repo & Config Layout

**GitHub**: `grobomo/mcp-manager` (public)

**What's in git:** Source code, build config, templates, GitHub Actions
**What's NOT in git (via .gitignore):** `servers.yaml`, `hooks.yaml`, `capabilities-cache.yaml`, `.env`, `managed-servers/` — these are personal configs stored as private gists


## TODO
- [x] Create README.md and publish to Confluence via wiki-lite
- [x] Build mcp-project-init - Project scaffolding with templates
- [x] Build mcp-companion-a2a - V1 Companion AI via A2A protocol
- [x] Deploy wiki pages for all MCPs under MCP Registry
- [x] Build mcp-bedrock-claude - AWS Bedrock Claude integration for multi-model workflows
- [x] Evaluate GitHub MCP server for Claude Code - upgraded to official ghcr.io/github/github-mcp-server

## Placeholder Servers (not auto-registered)
These folders exist but have no runnable server code yet:

| Server | Status | Notes |
|--------|--------|-------|
| mcp-companion-a2a | dev | V1 Companion AI via A2A - natural language V1 queries |
| mcp-v1 | archived | Official V1 MCP (50k tokens) - use v1-lite instead |
| mcp-atlassian-lite | container | Parent folder for wiki-lite, jira-lite, trello-lite |

## Structure
```
mcp-manager/
├── src/
│   ├── index.ts      # Main server entry point
│   ├── project.ts    # Project workflow tools (TODO)
│   └── utils.ts      # Shared utilities (TODO)
├── servers.yaml      # Server registry
├── capabilities-cache.yaml  # Cached tools from all servers
└── dist/index.js     # Built output
```

## Key Tools
- `mcp_list` - List all servers with capabilities
- `mcp_start/stop/restart` - Manage servers
- `mcp_tools` - Show available tools
- `mcp_call` - Call tools on backend servers
- `mcp_discover` - Find and register new servers

## Documentation Workflow

When updating project docs (README.md), use this workflow to sync GitHub and Wiki:

```
1. Edit README.md locally
2. "sync docs" or use project-init:sync_docs
   - Commits README.md and CLAUDE.md
   - Pushes to GitHub
   - Returns wiki_sync command

3. Run wiki_sync on the README.md file
   - Converts markdown to Confluence storage format
   - Updates the wiki page (uses page_id from frontmatter)
```

**Natural language:** "sync my docs" or "update github and wiki"

**Tools used:**
- `project-init:sync_docs` - Git commit + push
- `wiki-lite:wiki_sync` - Update Confluence page

**README frontmatter required for wiki sync:**
```yaml
---
page_id: 1234567890
title: Project Name
space_key: GAI
parent_id: 997951783
---
```
