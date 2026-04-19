#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# agent-skill-manager Installer
# The universal skill manager for AI coding agents.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/luongnv89/agent-skill-manager/main/install.sh | bash
#   wget -qO- https://raw.githubusercontent.com/luongnv89/agent-skill-manager/main/install.sh | bash
# ============================================================================

TOOL_NAME="agent-skill-manager"
REPO_OWNER="luongnv89"
REPO_NAME="agent-skill-manager"
BUN_MIN_VERSION="1.0.0"

# --- Color Output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[ OK ]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
err()   { printf "${RED}[ERR ]${NC}  %s\n" "$*" >&2; }
die()   { err "$@"; exit 1; }

# --- OS / Arch Detection ---
detect_os() {
    local os
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    case "$os" in
        linux*)  echo "linux" ;;
        darwin*) echo "macos" ;;
        mingw*|msys*|cygwin*) echo "windows" ;;
        *)       die "Unsupported operating system: $os" ;;
    esac
}

detect_arch() {
    local arch
    arch="$(uname -m)"
    case "$arch" in
        x86_64|amd64)  echo "x86_64" ;;
        aarch64|arm64) echo "arm64" ;;
        armv7l)        echo "armv7" ;;
        *)             die "Unsupported architecture: $arch" ;;
    esac
}

# --- Version Comparison ---
# Returns 0 if $1 >= $2 (semver)
version_gte() {
    local IFS=.
    local i ver1=($1) ver2=($2)
    for ((i=0; i<${#ver2[@]}; i++)); do
        local v1="${ver1[i]:-0}"
        local v2="${ver2[i]:-0}"
        if ((v1 > v2)); then return 0; fi
        if ((v1 < v2)); then return 1; fi
    done
    return 0
}

# --- Bun Detection & Installation ---
check_bun() {
    if command -v bun &>/dev/null; then
        local bun_version
        bun_version="$(bun --version 2>/dev/null || echo "0.0.0")"
        if version_gte "$bun_version" "$BUN_MIN_VERSION"; then
            ok "Bun $bun_version found (>= $BUN_MIN_VERSION required)"
            return 0
        else
            warn "Bun $bun_version found but >= $BUN_MIN_VERSION is required"
            return 1
        fi
    else
        return 1
    fi
}

install_bun() {
    info "Installing Bun..."
    if command -v curl &>/dev/null; then
        curl -fsSL https://bun.sh/install | bash
    elif command -v wget &>/dev/null; then
        wget -qO- https://bun.sh/install | bash
    else
        die "Neither curl nor wget found. Please install one of them first."
    fi

    # Source bun into current shell
    local bun_install="${BUN_INSTALL:-$HOME/.bun}"
    if [ -f "$bun_install/bin/bun" ]; then
        export BUN_INSTALL="$bun_install"
        export PATH="$bun_install/bin:$PATH"
    fi

    if ! command -v bun &>/dev/null; then
        die "Bun installation completed but 'bun' is not in PATH. Please restart your shell and re-run this script."
    fi

    ok "Bun $(bun --version) installed"
}

# --- Ensure Bun global bin is in PATH ---
ensure_bun_in_path() {
    local bun_bin="${BUN_INSTALL:-$HOME/.bun}/bin"
    if [[ ":$PATH:" != *":$bun_bin:"* ]]; then
        export PATH="$bun_bin:$PATH"
        info "Added $bun_bin to PATH for this session"
    fi
}

# --- Install agent-skill-manager ---
install_asm() {
    info "Installing $TOOL_NAME globally via Bun..."
    bun install -g "$TOOL_NAME"
    ok "$TOOL_NAME installed globally"
}

# --- Create command aliases ---
create_aliases() {
    local bun_bin="${BUN_INSTALL:-$HOME/.bun}/bin"
    local bin_target=""

    # Find the actual installed binary (could be skill-manager or agent-skill-manager)
    for name in skill-manager agent-skill-manager; do
        if [ -f "$bun_bin/$name" ] || [ -L "$bun_bin/$name" ]; then
            bin_target="$bun_bin/$name"
            break
        fi
    done

    if [ -z "$bin_target" ]; then
        warn "Could not find installed binary in $bun_bin"
        return 1
    fi

    # Create symlinks for all expected command names
    for alias_name in agent-skill-manager asm; do
        local alias_path="$bun_bin/$alias_name"
        if [ ! -f "$alias_path" ] && [ ! -L "$alias_path" ]; then
            ln -s "$bin_target" "$alias_path"
            ok "Created alias: $alias_name"
        fi
    done
}

# --- Verification ---
verify_installation() {
    info "Verifying installation..."
    local found=false

    for cmd in agent-skill-manager asm skill-manager; do
        if command -v "$cmd" &>/dev/null; then
            ok "$cmd is available"
            found=true
        fi
    done

    if [ "$found" = false ]; then
        warn "No commands found in PATH"
        warn "Add Bun's global bin to your PATH by adding this to your shell profile:"
        warn "  export PATH=\"\$HOME/.bun/bin:\$PATH\""
        return 1
    fi

    detect_path_shadowing

    return 0
}

# --- PATH shadowing detection ---
# Warns when multiple `asm` binaries live on different PATH entries (e.g. one
# from `npm install -g` and one from `bun add -g`). The first match in PATH
# wins, so an older install can silently outrun a fresh one.
detect_path_shadowing() {
    local IFS=':'
    local -a hits=()
    local -a seen_real=()
    local dir candidate real already

    for dir in $PATH; do
        [ -z "$dir" ] && continue
        candidate="$dir/asm"
        [ -x "$candidate" ] || continue
        real="$(realpath "$candidate" 2>/dev/null || readlink -f "$candidate" 2>/dev/null || echo "$candidate")"
        already=false
        for r in "${seen_real[@]}"; do
            if [ "$r" = "$real" ]; then
                already=true
                break
            fi
        done
        if [ "$already" = false ]; then
            seen_real+=("$real")
            hits+=("$candidate")
        fi
    done

    if [ "${#hits[@]}" -gt 1 ]; then
        echo ""
        warn "Detected ${#hits[@]} \`asm\` binaries on PATH — newer install may be shadowed:"
        warn "  resolved: ${hits[0]}"
        local i=1
        while [ $i -lt ${#hits[@]} ]; do
            warn "  shadowed: ${hits[$i]}"
            i=$((i + 1))
        done
        warn "Pick one package manager (npm OR bun) and remove the other:"
        warn "  npm uninstall -g agent-skill-manager"
        warn "  bun remove -g agent-skill-manager"
    fi
}

# --- Entry Point ---
main() {
    echo ""
    info "============================================"
    info " $TOOL_NAME Installer"
    info "============================================"
    echo ""

    local os arch
    os="$(detect_os)"
    arch="$(detect_arch)"
    info "OS: $os | Arch: $arch"
    echo ""

    # Step 1: Ensure Bun is installed
    if ! check_bun; then
        install_bun
    fi
    echo ""

    # Step 2: Ensure Bun global bin is in PATH
    ensure_bun_in_path

    # Step 3: Install agent-skill-manager
    install_asm
    echo ""

    # Step 4: Create aliases (agent-skill-manager, asm)
    create_aliases
    echo ""

    # Step 5: Verify
    if verify_installation; then
        echo ""
        info "============================================"
        ok "Installation complete!"
        info "============================================"
        echo ""
        info "Get started:"
        info "  asm                    # Launch interactive TUI (shorthand)"
        info "  agent-skill-manager    # Launch interactive TUI"
        info "  asm --help             # Show help"
        echo ""
    else
        echo ""
        warn "Installation finished but verification had warnings."
        warn "Try restarting your terminal, then run: agent-skill-manager"
        echo ""
    fi
}

main "$@"
