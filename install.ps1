# RtVS Installer Bootstrap - Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$RepoUrl    = "https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio.git"
$InstallDir = Join-Path $env:LOCALAPPDATA "RtVS"
$MinNode    = 18

# ─── Colors ───────────────────────────────────────────────────────────────────

function Write-Step  { param($msg) Write-Host "`n  " -NoNewline; Write-Host "→ " -ForegroundColor Cyan -NoNewline; Write-Host $msg }
function Write-Ok    { param($msg) Write-Host "  " -NoNewline; Write-Host "✓ " -ForegroundColor Green  -NoNewline; Write-Host $msg }
function Write-Warn  { param($msg) Write-Host "  " -NoNewline; Write-Host "! " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Write-Fail  { param($msg) Write-Host "  " -NoNewline; Write-Host "✗ " -ForegroundColor Red    -NoNewline; Write-Host $msg }
function Write-Info  { param($msg) Write-Host "  " -NoNewline; Write-Host $msg -ForegroundColor DarkGray }

# ─── Header ───────────────────────────────────────────────────────────────────

function Print-Header {
  Write-Host ""
  Write-Host "  ██████╗ ████████╗██╗   ██╗███████╗" -ForegroundColor Cyan
  Write-Host "  ██╔══██╗╚══██╔══╝██║   ██║██╔════╝" -ForegroundColor Cyan
  Write-Host "  ██████╔╝   ██║   ██║   ██║███████╗" -ForegroundColor Cyan
  Write-Host "  ██╔══██╗   ██║   ╚██╗ ██╔╝╚════██║" -ForegroundColor Cyan
  Write-Host "  ██║  ██║   ██║    ╚████╔╝ ███████║" -ForegroundColor Cyan
  Write-Host "  ╚═╝  ╚═╝   ╚═╝     ╚═══╝  ╚══════╝" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Roblox to Visual Studio  -  Installer" -ForegroundColor White
  Write-Info "Install directory: $InstallDir"
  Write-Host ""
}

# ─── Node.js check ────────────────────────────────────────────────────────────

function Get-NodeMajor {
  try {
    $ver = (node --version 2>$null).TrimStart('v')
    return [int]($ver.Split('.')[0])
  } catch { return 0 }
}

function Install-Node {
  Write-Host ""
  Write-Info "Node.js $MinNode+ is required to run the RtVS server."
  Write-Info "We'll install it now using winget."
  Write-Host ""
  $ans = Read-Host "  Allow Node.js installation? (Y/n)"
  if ($ans -match "^[Nn]") { Write-Fail "Installation cancelled."; exit 1 }

  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Info "Using winget - you may see a UAC prompt."
    winget install --id OpenJS.NodeJS --accept-source-agreements --accept-package-agreements
  } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Info "Using Chocolatey."
    choco install nodejs -y
  } else {
    Write-Fail "Neither winget nor Chocolatey found."
    Write-Info "Please install Node.js $MinNode+ from: https://nodejs.org"
    Write-Info "Then re-run this installer."
    exit 1
  }

  # Refresh PATH so node is available immediately
  $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

function Check-Node {
  Write-Step "Checking for Node.js $MinNode+…"
  $major = Get-NodeMajor
  if ($major -ge $MinNode) {
    Write-Ok "Node.js $(node --version) found."
    return
  }
  if ($major -gt 0) {
    Write-Warn "Node.js $(node --version) is too old (need $MinNode+). Upgrading…"
  } else {
    Write-Warn "Node.js not found."
  }
  Install-Node
  $major = Get-NodeMajor
  if ($major -lt $MinNode) {
    Write-Fail "Node.js installation did not succeed."
    Write-Info "Please install Node.js $MinNode+ from https://nodejs.org and re-run."
    exit 1
  }
  Write-Ok "Node.js $(node --version) installed."
}

# ─── git check ────────────────────────────────────────────────────────────────

function Check-Git {
  Write-Step "Checking for git…"
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Ok "git $(git --version) found."
    return
  }
  Write-Warn "git not found."
  Write-Info "Git is required. Installing via winget…"
  $ans = Read-Host "  Allow git installation? (Y/n)"
  if ($ans -match "^[Nn]") { Write-Fail "Installation cancelled."; exit 1 }
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id Git.Git --accept-source-agreements --accept-package-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
  } else {
    Write-Fail "winget not available. Install git from: https://git-scm.com"
    exit 1
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Fail "git not found after install. Please install manually and re-run."
    exit 1
  }
  Write-Ok "git installed."
}

# ─── Clone / update repo ──────────────────────────────────────────────────────

function Setup-Repo {
  Write-Step "Setting up RtVS at $InstallDir…"

  if (Test-Path (Join-Path $InstallDir ".git")) {
    Write-Info "Existing installation found - syncing to latest main…"
    Write-Info "(any local modifications in $InstallDir will be discarded)"
    Push-Location $InstallDir
    git fetch --depth 1 origin main
    git reset --hard origin/main
    Pop-Location
    Write-Ok "Repository synced."
  } else {
    if (Test-Path $InstallDir) {
      Write-Warn "Directory exists but is not a git repo - removing it first."
      Remove-Item -Recurse -Force $InstallDir
    }
    git clone --depth 1 $RepoUrl $InstallDir
    Write-Ok "Repository cloned to $InstallDir."
  }
}

# ─── Run interactive installer ────────────────────────────────────────────────

function Run-Installer {
  Write-Step "Launching RtVS installer…"
  Clear-Host
  $installerPath = Join-Path $InstallDir "installer.mjs"
  node $installerPath
}

# ─── Main ─────────────────────────────────────────────────────────────────────

Print-Header
Check-Node
Check-Git
Setup-Repo
Run-Installer
