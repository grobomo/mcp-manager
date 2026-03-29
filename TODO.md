# mcp-manager

## Current tasks (2026-03-28)

- [x] Fix stdio transport concurrency bug — sendRequest creates a new readline per call, racing on stdout
- [x] Add persistent per-server readline with request ID dispatch
- [x] Clean up readline and pending requests on server stop
- [x] Add test coverage for utils.ts (sanitizeLog, validatePath, formatBytes)
- [x] Add test coverage for lifecycle operations (start, stop, restart, enable)
- [ ] Add test coverage for hooks.ts (pattern matching, extraction)
- [ ] Add test coverage for search operation
- [ ] Add HTTP server health check in idle checker

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
