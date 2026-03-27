#!/usr/bin/env python3
import json, os, shutil, sys
from pathlib import Path

GREEN, YELLOW, RED, RESET, BOLD = "[92m", "[93m", "[91m", "[0m", "[1m"
BACKUP_DIR = Path.home() / ".mcp-manager-backup"
CONFIG_FILES = ["servers.yaml", "hooks.yaml", "metadata.yaml", "capabilities-cache.yaml"]

def log(msg, level="INFO"):
    print(f"{dict(INFO=GREEN,WARN=YELLOW,ERR=RED).get(level,'')}[{level}]{RESET} {msg}")

def warn_stderr(msg):
    print(f"{YELLOW}{BOLD}WARNING:{RESET} {msg}", file=sys.stderr)

def find_backups(p):
    return sorted(p.parent.glob(f"{p.name}.backup.*"), reverse=True)

def backup_configs(d, dry=False):
    if dry: return log(f"Would backup to: {BACKUP_DIR}")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for f in CONFIG_FILES:
        if (d/f).exists(): shutil.copy2(d/f, BACKUP_DIR/f); log(f"Backed up: {f}")

def restore_backup(dst, src, dry=False):
    if dry: return log(f"Would restore: {src}")
    shutil.copy2(src, dst); log(f"Restored: {dst}")

def remove_mcpm_from_json(p, dry=False):
    if not p.exists(): return
    cfg = json.load(open(p))
    if "mcpServers" in cfg and "mcp-manager" in cfg["mcpServers"]:
        if dry: return log(f"Would remove mcp-manager from: {p}")
        del cfg["mcpServers"]["mcp-manager"]
        json.dump(cfg, open(p,"w"), indent=2); log(f"Removed mcp-manager from: {p}")

def delete_dir(p, dry=False):
    if not p.exists(): return
    if dry: return log(f"Would delete: {p}")
    shutil.rmtree(p) if p.is_dir() else p.unlink(); log(f"Deleted: {p}")

def main():
    auto, dry, purge = "-y" in sys.argv, "--dry-run" in sys.argv, "--purge" in sys.argv
    print(f"
{BOLD}MCP Manager Uninstall{RESET}
" + "="*40)
    if dry: log("DRY RUN", "WARN")
    if purge: log("PURGE MODE - backups will be deleted", "WARN")
    
    d = Path(__file__).parent.resolve()
    print(f"
Location: {d}
Backup: {BACKUP_DIR}")
    
    # Step 0: Backup
    print(f"
{BOLD}Step 0: Backup configs{RESET}
" + "-"*40)
    cfgs = [f for f in CONFIG_FILES if (d/f).exists()]
    if cfgs:
        print("Found:", cfgs)
        if auto or input("Backup? [Y/n]: ").lower() != "n": backup_configs(d, dry)
    
    # Step 1: Restore .mcp.json
    print(f"
{BOLD}Step 1: Restore .mcp.json{RESET}
" + "-"*40)
    for mcp in [Path.home()/".mcp.json", Path.cwd()/".mcp.json"]:
        if not mcp.exists(): continue
        bkps = find_backups(mcp)
        if bkps:
            print(f"Backups for {mcp}: {[b.name for b in bkps[:3]]}")
            if auto: restore_backup(mcp, bkps[0], dry)
            else:
                c = input("Restore? [1/n/m]: ").strip()
                if c=="n": pass
                elif c=="m": remove_mcpm_from_json(mcp, dry)
                else: restore_backup(mcp, bkps[0], dry)
        else:
            warn_stderr(f"No backup for {mcp}")
            print("  Cannot fully restore. Will remove mcp-manager entry.", file=sys.stderr)
            if auto or input("Remove entry? [y/N]: ").lower()=="y": remove_mcpm_from_json(mcp, dry)
    
    # Step 2: Delete files
    print(f"
{BOLD}Step 2: Delete files{RESET}
" + "-"*40)
    to_del = [d/"build", d/"dist", d/"node_modules", d/".local", d/"mcp-manager.log"] + [d/f for f in CONFIG_FILES]
    existing = [p for p in to_del if p.exists()]
    if existing:
        print("Files:", [p.name for p in existing])
        if auto or input("Delete? [y/N]: ").lower()=="y":
            for p in existing: delete_dir(p, dry)
    
    # Step 3: Delete folder
    print(f"
{BOLD}Step 3: Delete folder?{RESET}
" + "-"*40)
    if auto or input(f"Delete {d}? [y/N]: ").lower()=="y":
        if dry: log(f"Would delete: {d}")
        else: print(f"Run: rm -rf "{d}"" if os.name!="nt" else f"rmdir /s /q "{d}"")
    
    # Step 4: Purge
    if purge:
        print(f"
{BOLD}Step 4: Purge backup{RESET}
" + "-"*40)
        if BACKUP_DIR.exists(): delete_dir(BACKUP_DIR, dry)
    
    print(f"
{BOLD}Done!{RESET}")
    if not purge and BACKUP_DIR.exists(): print(f"Backup: {BACKUP_DIR}
Reinstall will restore.")
    print("Restart Claude Code.
")

if __name__=="__main__": main()

