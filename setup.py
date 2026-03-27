#!/usr/bin/env python3
"""
MCP Manager Setup Script

One-click setup for mcp-manager with Claude Code.
Run this after cloning the repo -- it handles everything.

Usage:
    python setup.py              # Full setup (build + configure + verify)
    python setup.py --check      # Check prerequisites only
    python setup.py --migrate    # Migrate existing .mcp.json servers
"""

import os
import sys
import json
import shutil
import subprocess
import argparse
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent.resolve()
MCP_MANAGER_DIR = SCRIPT_DIR
SRC_DIR = MCP_MANAGER_DIR / "src"
SERVERS_YAML = MCP_MANAGER_DIR / "servers.yaml"
SERVERS_YAML_EXAMPLE = MCP_MANAGER_DIR / "servers.yaml.example"
BACKUP_DIR = Path.home() / ".mcp-manager-backup"
CONFIG_FILES = ["servers.yaml", "hooks.yaml", "metadata.yaml", "capabilities-cache.yaml"]


def log(msg: str, level: str = "INFO"):
    colors = {"INFO": "\033[94m", "OK": "\033[92m", "WARN": "\033[93m", "ERR": "\033[91m", "": "\033[0m"}
    print(f"{colors.get(level, '')}{msg}{colors['']}")


def check_prerequisites() -> bool:
    """Check that required tools are installed."""
    log("Checking prerequisites...")

    required = {
        "python": ["python", "--version"],
        "node": ["node", "--version"],
        "npm": ["npm", "--version"],
    }

    all_ok = True
    for name, cmd in required.items():
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                version = result.stdout.strip() or result.stderr.strip()
                log(f"  {name}: {version}", "OK")
            else:
                log(f"  {name}: not found", "ERR")
                all_ok = False
        except FileNotFoundError:
            log(f"  {name}: not installed", "ERR")
            all_ok = False
        except Exception as e:
            log(f"  {name}: error - {e}", "ERR")
            all_ok = False

    return all_ok


def restore_from_backup() -> bool:
    """Check for and restore configs from previous install."""
    if not BACKUP_DIR.exists():
        return False

    backed_up = [f for f in CONFIG_FILES if (BACKUP_DIR / f).exists()]
    if not backed_up:
        return False

    log(f"Found backup from previous install: {BACKUP_DIR}")
    log("Backed up configs:")
    for f in backed_up:
        log(f"  - {f}")

    response = input("\nRestore these configs? [Y/n]: ").strip().lower()
    if response == "n":
        log("Skipped restore", "WARN")
        return False

    for f in backed_up:
        src = BACKUP_DIR / f
        dst = MCP_MANAGER_DIR / f
        shutil.copy2(src, dst)
        log(f"  Restored: {f}", "OK")

    log("Configs restored from backup!", "OK")
    return True


def build_mcp_manager() -> bool:
    """Build mcp-manager TypeScript project."""
    if not SRC_DIR.exists():
        log("No src/ directory found - using Python-only mode", "WARN")
        return True

    log("Building mcp-manager...")

    package_json = MCP_MANAGER_DIR / "package.json"
    if not package_json.exists():
        log("No package.json found - skipping npm build", "WARN")
        return True

    try:
        log("  Installing npm dependencies...")
        result = subprocess.run(
            ["npm", "install"],
            cwd=MCP_MANAGER_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode != 0:
            log(f"  npm install failed: {result.stderr}", "ERR")
            return False

        log("  Building TypeScript...")
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=MCP_MANAGER_DIR,
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            log(f"  npm build failed: {result.stderr}", "ERR")
            return False

        log("  Build complete", "OK")
        return True

    except subprocess.TimeoutExpired:
        log("  Build timed out", "ERR")
        return False
    except Exception as e:
        log(f"  Build error: {e}", "ERR")
        return False


def ensure_servers_yaml():
    """Create servers.yaml from example if it doesn't exist."""
    if SERVERS_YAML.exists():
        log("  servers.yaml already exists", "OK")
        return True

    if SERVERS_YAML_EXAMPLE.exists():
        shutil.copy2(SERVERS_YAML_EXAMPLE, SERVERS_YAML)
        log("  Created servers.yaml from servers.yaml.example", "OK")
        return True

    # Create minimal starter config
    starter = (
        "# MCP Manager - Server Registry\n"
        "# Add your MCP servers here. See README.md for full options.\n"
        "\n"
        "servers:\n"
        "  # Example: uncomment and customize\n"
        "  # my-server:\n"
        "  #   description: My MCP server\n"
        "  #   command: node\n"
        "  #   args:\n"
        "  #     - ./managed-servers/my-server/dist/index.js\n"
        "  #   enabled: true\n"
        "  #   auto_start: false\n"
        "\n"
        "defaults:\n"
        "  timeout: 30\n"
        "  retry_count: 3\n"
        "  health_check_interval: 60\n"
    )
    SERVERS_YAML.write_text(starter, encoding="utf-8")
    log("  Created starter servers.yaml", "OK")
    return True


def get_mcp_manager_entry() -> dict:
    """Build the .mcp.json entry for mcp-manager."""
    server_py = MCP_MANAGER_DIR / "server.py"
    if server_py.exists():
        return {
            "command": "python",
            "args": [str(server_py).replace("\\", "/")]
        }
    build_index = MCP_MANAGER_DIR / "build" / "index.js"
    return {
        "command": "node",
        "args": [str(build_index).replace("\\", "/")]
    }


def configure_mcp_json() -> bool:
    """Auto-configure .mcp.json with mcp-manager entry."""
    log("\nConfiguring .mcp.json...")

    # Look for existing .mcp.json in user's home dir (Claude Code global config)
    home_mcp_json = Path.home() / ".mcp.json"
    # Also check project-level
    project_mcp_json = MCP_MANAGER_DIR / ".mcp.json"

    # Prefer home-level so mcp-manager is available in all projects
    target = home_mcp_json
    config = {}

    if target.exists():
        try:
            config = json.loads(target.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            config = {}

    mcp_servers = config.setdefault("mcpServers", {})
    entry = get_mcp_manager_entry()

    if "mcp-manager" in mcp_servers:
        existing = mcp_servers["mcp-manager"]
        if existing.get("args") == entry["args"] and existing.get("command") == entry["command"]:
            log(f"  mcp-manager already configured in {target}", "OK")
            return True
        log(f"  Updating mcp-manager entry in {target}", "INFO")
    else:
        log(f"  Adding mcp-manager to {target}", "INFO")

    mcp_servers["mcp-manager"] = entry
    target.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    log(f"  Configured {target}", "OK")
    return True


def inject_claude_md_instructions():
    """Add mcp-manager instructions to global CLAUDE.md."""
    claude_dir = Path.home() / ".claude"
    claude_md = claude_dir / "CLAUDE.md"

    instructions = """
## MCP Manager Instructions

**Dynamic MCP Server Management (no restart required):**
- mcp-manager lets you start/stop MCP servers without restarting Claude Code
- Use `mcpm(operation="list")` to see available servers
- Use `mcpm(operation="start", server="server-name")` to start a server
- Use `mcpm(operation="stop", server="server-name")` to stop a server

**CRITICAL: Hook Data Priority**
ALWAYS trust hook-injected `[MCP Context]` data over ANY other source:
1. Hook shows `server [RUNNING]` -> use that exact server name
2. Hook shows `[stopped]` -> start server first with mcpm
3. Hook shows allowed servers -> ONLY use those servers
4. If server not in hook list -> it does not exist or is not allowed

**Why:** Context summaries from previous sessions contain stale server names. Hooks provide live state.
"""

    marker = "## MCP Manager Instructions"
    claude_dir.mkdir(exist_ok=True)
    existing = ""
    if claude_md.exists():
        existing = claude_md.read_text(encoding="utf-8")
    if marker in existing:
        log("  CLAUDE.md already has mcp-manager instructions", "OK")
        return True
    new_content = existing.rstrip() + "\n" + instructions
    claude_md.write_text(new_content, encoding="utf-8")
    log(f"  Added mcp-manager instructions to {claude_md}", "OK")
    return True


def verify_setup() -> bool:
    """Verify mcp-manager can start by running a quick smoke test."""
    log("\nVerifying installation...")

    entry = get_mcp_manager_entry()
    cmd = [entry["command"]] + entry["args"]

    try:
        # Start the server and immediately send an empty message to check it loads
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(MCP_MANAGER_DIR),
        )
        # Give it a moment to crash or succeed, then kill
        try:
            _, stderr = proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            # Timeout = good, means the server is running and waiting for input
            proc.kill()
            proc.wait()
            log("  Server starts successfully", "OK")
            return True

        # If it exited, check the return code
        if proc.returncode == 0:
            log("  Server starts successfully", "OK")
            return True
        else:
            stderr_text = stderr.decode("utf-8", errors="replace") if stderr else ""
            log(f"  Server exited with code {proc.returncode}", "ERR")
            if stderr_text:
                for line in stderr_text.strip().split("\n")[:5]:
                    log(f"    {line}", "ERR")
            return False

    except FileNotFoundError:
        log(f"  Command not found: {cmd[0]}", "ERR")
        return False
    except Exception as e:
        log(f"  Verification error: {e}", "ERR")
        return False


def migrate_mcp_json():
    """Migrate servers from existing .mcp.json to mcp-manager."""
    # Check home-level and walk up from cwd
    candidates = [Path.home() / ".mcp.json"]
    current = Path.cwd()
    while current != current.parent:
        candidates.append(current / ".mcp.json")
        current = current.parent

    mcp_json_path = None
    for p in candidates:
        if p.exists():
            mcp_json_path = p
            break

    if not mcp_json_path:
        log("No .mcp.json found", "WARN")
        return

    log(f"Found .mcp.json at: {mcp_json_path}")

    try:
        with open(mcp_json_path) as f:
            config = json.load(f)
    except Exception as e:
        log(f"Failed to read .mcp.json: {e}", "ERR")
        return

    mcp_servers = config.get("mcpServers", {})
    other_servers = {k: v for k, v in mcp_servers.items() if k != "mcp-manager"}
    if not other_servers:
        log("No other servers to migrate (only mcp-manager or empty)", "OK")
        return

    log(f"Found {len(other_servers)} server(s) that could be managed by mcp-manager:")
    for name in other_servers:
        log(f"  - {name}")

    log("\nTo migrate these servers to mcp-manager:", "INFO")
    log("1. Add them to servers.yaml with appropriate config")
    log("2. Remove them from .mcp.json (keep only mcp-manager)")
    log("3. Use mcpm(operation='reload') to pick up changes")


def main():
    parser = argparse.ArgumentParser(description="Set up mcp-manager")
    parser.add_argument("--check", action="store_true", help="Check prerequisites only")
    parser.add_argument("--migrate", action="store_true", help="Migrate existing .mcp.json")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  MCP Manager Setup")
    print("=" * 60 + "\n")

    # Check prerequisites
    if not check_prerequisites():
        log("\nPrerequisites not met. Please install missing tools.", "ERR")
        sys.exit(1)

    if args.check:
        log("\nPrerequisites OK", "OK")
        return

    if args.migrate:
        migrate_mcp_json()
        return

    # Restore from backup if available
    restore_from_backup()

    # Build
    if not build_mcp_manager():
        log("\nBuild failed", "ERR")
        sys.exit(1)

    # Create servers.yaml if missing
    log("\nConfiguring server registry...")
    ensure_servers_yaml()

    # Auto-configure .mcp.json
    configure_mcp_json()

    # Inject instructions to global CLAUDE.md
    log("\nConfiguring Claude Code instructions...")
    inject_claude_md_instructions()

    # Verify it actually works
    verified = verify_setup()

    log("\n" + "=" * 60, "OK")
    log("  Setup Complete!", "OK")
    log("=" * 60, "OK")

    if verified:
        log("\nmcp-manager is installed and ready.", "OK")
        log("Open a new Claude Code session to start using it.", "INFO")
        log("\nQuick start:")
        log('  mcpm(operation="list_servers")    -- see available servers')
        log('  mcpm(operation="help")            -- see all operations')
    else:
        log("\nSetup finished but verification failed.", "WARN")
        log("Check the errors above and try: python setup.py --check", "INFO")

    # Show migration hint if other servers exist in .mcp.json
    home_mcp = Path.home() / ".mcp.json"
    if home_mcp.exists():
        try:
            config = json.loads(home_mcp.read_text(encoding="utf-8"))
            others = [k for k in config.get("mcpServers", {}) if k != "mcp-manager"]
            if others:
                log(f"\nTip: You have {len(others)} other server(s) in .mcp.json.", "INFO")
                log("Run 'python setup.py --migrate' to move them under mcp-manager.", "INFO")
        except (json.JSONDecodeError, OSError):
            pass


if __name__ == "__main__":
    main()
