#!/usr/bin/env bash
# RtVS Installer Bootstrap - Linux / macOS
# Usage: sh -c "$(curl -sS https://raw.githubusercontent.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/main/install.sh)"

set -euo pipefail

REPO_URL="https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio.git"
INSTALL_DIR="$HOME/RtVS"
MIN_NODE_MAJOR=18

# If install.sh is being run from inside the repo itself, use that directory
# directly instead of cloning (e.g. during development or after a manual clone).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
if [ -n "$SCRIPT_DIR" ] && [ -f "${SCRIPT_DIR}/installer.mjs" ]; then
  INSTALL_DIR="$SCRIPT_DIR"
fi

# ─── Colors ───────────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; DIM=''; NC=''
fi

step()  { echo -e "\n${CYAN}→${NC} $1"; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}!${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; }
info()  { echo -e "  ${DIM}$1${NC}"; }

# ─── Header ───────────────────────────────────────────────────────────────────

print_header() {
  echo
  echo -e "${CYAN}${BOLD}  ██████╗ ████████╗██╗   ██╗███████╗${NC}"
  echo -e "${CYAN}${BOLD}  ██╔══██╗╚══██╔══╝██║   ██║██╔════╝${NC}"
  echo -e "${CYAN}${BOLD}  ██████╔╝   ██║   ██║   ██║███████╗${NC}"
  echo -e "${CYAN}${BOLD}  ██╔══██╗   ██║   ╚██╗ ██╔╝╚════██║${NC}"
  echo -e "${CYAN}${BOLD}  ██║  ██║   ██║    ╚████╔╝ ███████║${NC}"
  echo -e "${CYAN}${BOLD}  ╚═╝  ╚═╝   ╚═╝     ╚═══╝  ╚══════╝${NC}"
  echo
  echo -e "  ${BOLD}Roblox to Visual Studio  -  Installer${NC}"
  echo -e "  ${DIM}Install directory: ${INSTALL_DIR}${NC}"
  echo
}

# ─── OS detection ─────────────────────────────────────────────────────────────

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)  echo "linux" ;;
    *)      echo "unknown" ;;
  esac
}

OS=$(detect_os)

# ─── Node.js installation ─────────────────────────────────────────────────────

node_major_version() {
  node --version 2>/dev/null | sed 's/v//' | cut -d. -f1
}

install_node_linux() {
  echo
  info "Node.js ${MIN_NODE_MAJOR}+ is required to run the RtVS server."
  info "We'll install it now using your system package manager."
  echo
  read -rp "  Allow Node.js installation? (Y/n) " ans
  case "${ans,,}" in n|no) fail "Installation cancelled."; exit 1;; esac

  if command -v apt-get &>/dev/null; then
    info "Using apt - you may be asked for your password (sudo)."
    sudo apt-get update -qq
    sudo apt-get install -y nodejs npm
  elif command -v dnf &>/dev/null; then
    info "Using dnf - you may be asked for your password (sudo)."
    sudo dnf install -y nodejs
  elif command -v pacman &>/dev/null; then
    info "Using pacman - you may be asked for your password (sudo)."
    sudo pacman -Sy --noconfirm nodejs npm
  elif command -v zypper &>/dev/null; then
    info "Using zypper - you may be asked for your password (sudo)."
    sudo zypper install -y nodejs-default npm-default
  else
    fail "No supported package manager found (apt / dnf / pacman / zypper)."
    info "Please install Node.js ${MIN_NODE_MAJOR}+ from: https://nodejs.org"
    exit 1
  fi
}

install_node_macos() {
  echo
  info "Node.js ${MIN_NODE_MAJOR}+ is required to run the RtVS server."
  info "We'll install it now using Homebrew."
  echo
  read -rp "  Allow Node.js installation via Homebrew? (Y/n) " ans
  case "${ans,,}" in n|no) fail "Installation cancelled."; exit 1;; esac

  if ! command -v brew &>/dev/null; then
    fail "Homebrew not found. Install it first: https://brew.sh"
    info "Then re-run the installer."
    exit 1
  fi
  brew install node
}

check_node() {
  step "Checking for Node.js ${MIN_NODE_MAJOR}+…"

  if command -v node &>/dev/null; then
    local major
    major=$(node_major_version)
    if [ "${major}" -ge "${MIN_NODE_MAJOR}" ]; then
      ok "Node.js v$(node --version | sed 's/v//') found."
      return
    else
      warn "Node.js v$(node --version | sed 's/v//') is too old (need ${MIN_NODE_MAJOR}+). Upgrading…"
    fi
  else
    warn "Node.js not found."
  fi

  if [ "$OS" = "linux" ];  then install_node_linux;
  elif [ "$OS" = "macos" ]; then install_node_macos;
  else
    fail "Unsupported OS. Install Node.js ${MIN_NODE_MAJOR}+ manually: https://nodejs.org"
    exit 1
  fi

  if ! command -v node &>/dev/null || [ "$(node_major_version)" -lt "${MIN_NODE_MAJOR}" ]; then
    fail "Node.js installation did not succeed."
    info "Please install Node.js ${MIN_NODE_MAJOR}+ from https://nodejs.org and re-run."
    exit 1
  fi
  ok "Node.js $(node --version) installed."
}

# ─── git installation ─────────────────────────────────────────────────────────

install_git_linux() {
  echo
  info "git is required to download RtVS."
  read -rp "  Allow git installation? (Y/n) " ans
  case "${ans,,}" in n|no) fail "Installation cancelled."; exit 1;; esac

  if command -v apt-get &>/dev/null;  then sudo apt-get install -y git
  elif command -v dnf &>/dev/null;    then sudo dnf install -y git
  elif command -v pacman &>/dev/null; then sudo pacman -Sy --noconfirm git
  elif command -v zypper &>/dev/null; then sudo zypper install -y git
  else fail "Could not install git. Install it manually and re-run."; exit 1
  fi
}

check_git() {
  step "Checking for git…"
  if command -v git &>/dev/null; then
    ok "git $(git --version | awk '{print $3}') found."
    return
  fi
  warn "git not found."
  if [ "$OS" = "linux" ]; then install_git_linux
  elif [ "$OS" = "macos" ]; then
    info "Install git via Xcode command line tools: xcode-select --install"
    exit 1
  fi
  command -v git &>/dev/null || { fail "git not found after install."; exit 1; }
  ok "git installed."
}

# ─── Clone / update repo ──────────────────────────────────────────────────────

setup_repo() {
  # If we're already running from the repo, skip cloning
  if [ -n "$SCRIPT_DIR" ] && [ "$INSTALL_DIR" = "$SCRIPT_DIR" ]; then
    ok "Using existing repo at ${INSTALL_DIR}."
    return
  fi

  step "Setting up RtVS at ${INSTALL_DIR}…"

  if [ -d "${INSTALL_DIR}/.git" ]; then
    info "Existing installation found - updating…"
    git -C "${INSTALL_DIR}" pull --ff-only
    ok "Repository updated."
  else
    if [ -d "${INSTALL_DIR}" ]; then
      warn "Directory exists but is not a git repo - removing it first."
      rm -rf "${INSTALL_DIR}"
    fi
    git clone --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
    ok "Repository cloned to ${INSTALL_DIR}."
  fi
}

# ─── Run interactive installer ────────────────────────────────────────────────

run_installer() {
  step "Launching RtVS installer…"
  clear
  node "${INSTALL_DIR}/installer.mjs"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

print_header
check_node
check_git
setup_repo
run_installer
