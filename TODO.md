# mcp-manager Code Review & Optimization

## Context
Full code review identified issues during blueprint-extra client_id debugging session (2026-03-28).

## Completed
- [x] Blueprint auto-enable middleware (call.ts) — committed 4050e4d
- [x] Blueprint CLAUDE.md workflow docs — committed e250e4e
- [x] PreToolUse enforcement hook (git + TODO.md checks)
- [x] Hook module system (sm-stop.js, sm-pretooluse.js runners)
- [x] Updated hook-manager and super-manager SKILL.md to match reality
- [x] Fix `package.json` main/start: `dist/` -> `build/`
- [x] Fix `DEFAULT_IDLE_TIMEOUT` inconsistency: single source of truth in utils.ts (3600000ms)
- [x] Extract shared `getProcessMemoryMB` + `formatBytes` to utils.ts
- [x] Import shared functions in status.ts and usage.ts
- [x] Import shared constant in details.ts and index.ts
- [x] Add process cleanup handler (kill child processes on exit)
- [x] Remove hardcoded "joel" maintainer in registry.ts discover
- [x] Archive dead code: logging.ts -> src/archive/logging.ts
- [x] Archive dead code: organize/index.ts -> src/archive/organize.ts
- [x] Remove organize export from operations/index.ts
- [x] Track blueprint enabled state in memory (no status call per browser_* tool)
- [x] Move argsStr computation after middleware (correct logging)
