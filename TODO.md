# mcp-manager Code Review & Optimization

## Context
Full code review identified issues during blueprint-extra client_id debugging session (2026-03-28).
Blueprint middleware already committed. This covers remaining cleanup.

## Tasks

### Critical
- [ ] Fix `package.json` main/start: points to `dist/` but build outputs to `build/`
- [ ] Fix `DEFAULT_IDLE_TIMEOUT` inconsistency: index.ts uses 3600000 (1hr), status.ts/details.ts use 300000 (5min)

### DRY
- [ ] Extract shared `getProcessMemoryMB` + `formatBytes` to `src/utils.ts` (duplicated in status.ts and usage.ts)
- [ ] Import shared functions in `status.ts` and `usage.ts`, remove local copies

### Cleanup (archive, don't delete)
- [ ] `src/logging.ts` — never imported, dead code. Move to `src/archive/`
- [ ] `src/operations/organize/index.ts` — not wired into switch statement, dead code. Move to `src/archive/`
- [ ] `src/operations/index.ts` — remove organize export after archiving

### Safety
- [ ] `src/index.ts` — add `process.on('exit')` to kill child processes (prevent orphans)
- [ ] `src/operations/admin/registry.ts` line 189 — remove hardcoded `"joel"` maintainer (PII on public repo)

### Performance
- [ ] `src/operations/call/call.ts` — track blueprint enabled state in mcp-manager memory instead of calling status per browser_* tool
- [ ] `src/operations/call/call.ts` — move `argsStr` computation after blueprint middleware (currently logs stale args)

## Completed
- [x] Blueprint auto-enable middleware (call.ts) — committed 4050e4d
- [x] Blueprint CLAUDE.md workflow docs — committed e250e4e
- [x] PreToolUse enforcement hook (git + TODO.md checks)
- [x] Hook module system (sm-stop.js, sm-pretooluse.js runners)
- [x] Updated hook-manager and super-manager SKILL.md to match reality
