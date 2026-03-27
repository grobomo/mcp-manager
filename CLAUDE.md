# mcp-manager

Dynamic MCP Server Proxy Router - manages and routes to other MCP servers.

## Dev/Prod Workflow

This repo is the **DEV** version (personal, may contain secrets in configs).

**Why is the GitHub repo called `mcp-dev` and not `mcp-manager`?**
The local folder is `mcp-manager` but the GitHub repo is `mcp-dev` because this is the development copy containing personal server configs (servers.yaml) and secrets. The clean/shareable version is published separately as `mcp-manager` on grobomo. Don't rename the remote — the dev/prod split is intentional.

**Repos:**
- **Dev**: `mcp/mcp-manager` (local) -> `joel-ginsberg_tmemu/mcp-dev` on GitHub (private, personal configs)
- **Prod**: `mcp/mcp-manager-prod` (local) -> `grobomo/mcp-manager` on GitHub (public, clean)

**Sync dev to prod:**
```bash
./scripts/sync-to-prod.sh           # Full sync with secret scan
./scripts/sync-to-prod.sh --dry-run # Preview changes
```

**What gets synced:**
- Source code (src/*.ts)
- Build config (package.json, tsconfig.json)
- Setup script (setup.py)
- Templates (.env.example, .gitignore)

**What stays in dev only:**
- servers.yaml (personal server configs)
- *.env files (secrets)
- capabilities-cache.yaml
- node_modules/, dist/, .local/


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
