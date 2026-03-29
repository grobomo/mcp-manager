# mcp-manager

## Status: Code review round 2 — fixing bugs and coverage gaps

## In Progress (2026-03-29, session 3)
- [ ] Fix saveServersConfig bug: strips timeout/idle_timeout from per-server configs, breaking custom values on save+reload
- [ ] Remove dead defaults (retry_count, health_check_interval) — not used anywhere in codebase
- [ ] DRY tool registration loop in startServer (duplicated between HTTP and stdio paths)
- [ ] Add middleware tests (blueprint auto-enable is critical, untested)
- [ ] Add binary-filter tests (coverage gap)

## Completed (2026-03-29)
- [x] Fix README.md: idle timeout says 5min, actual default is 1hr
- [x] Fix README.md: remove undocumented `keywords` server option
- [x] Add new features to README: health checks, metrics
- [x] Fix credential helper rule: use double quotes (root cause of \\!gh bug)

## Completed (2026-03-29)
- [x] Extract duplicated server cleanup into `cleanupServer()` helper (DRY — was in 3 places)
- [x] Fix HTTP health check: reject pending requests before removing server
- [x] Remove unused imports (ChildProcess, readdirSync)
- [x] Fix CI: exclude tests/ from secret scan (test files contain intentional example secrets)
- [x] Fix credential helper double-backslash escaping
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
