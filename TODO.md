# mcp-manager

## Status: All tasks complete. 72 tests passing.

## Completed this session (2026-03-28)
- [x] Fix stdio transport concurrency bug — persistent readline per server with request ID dispatch
- [x] Clean up readline and pending requests on server stop and crash detection
- [x] Add test coverage for utils.ts (sanitizeLog, validatePath, formatBytes) — 17 tests
- [x] Add test coverage for hooks.ts (pattern matching, extraction) — 11 tests
- [x] Add test coverage for search operation — 11 tests
- [x] Add lifecycle operation tests (start/stop/restart/enable) — 13 tests
- [x] Add HTTP server health check in idle checker

## All completed (2026-03-28)
- [x] Blueprint auto-enable middleware
- [x] Required param validation for non-blueprint servers
- [x] Blueprint CLAUDE.md workflow docs
- [x] Fix package.json paths (dist/ -> build/)
- [x] Fix DEFAULT_IDLE_TIMEOUT inconsistency
- [x] Extract shared utils
- [x] Process exit cleanup handler
- [x] Remove PII from registry.ts discover
- [x] Archive dead code (logging.ts, organize/)
- [x] Track blueprint state in memory
- [x] Fix argsStr logging after middleware
- [x] Add .claude/ to .gitignore
