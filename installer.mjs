#!/usr/bin/env node
/**
 * RtVS Interactive Installer
 * Standalone ES module - no external dependencies
 * Run via: node installer.mjs
 */

import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";

const INSTALL_DIR = path.dirname(new URL(import.meta.url).pathname);

// ─── ANSI Colors ────────────────────────────────────────────────────────────

const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
};

const isTTY = process.stdout.isTTY;
const col = (code, text) => isTTY ? `${code}${text}${c.reset}` : text;

// ─── Header ─────────────────────────────────────────────────────────────────

function printHeader() {
  console.log();
  console.log(col(c.cyan + c.bold, "  ██████╗ ████████╗██╗   ██╗███████╗"));
  console.log(col(c.cyan + c.bold, "  ██╔══██╗╚══██╔══╝██║   ██║██╔════╝"));
  console.log(col(c.cyan + c.bold, "  ██████╔╝   ██║   ██║   ██║███████╗"));
  console.log(col(c.cyan + c.bold, "  ██╔══██╗   ██║   ╚██╗ ██╔╝╚════██║"));
  console.log(col(c.cyan + c.bold, "  ██║  ██║   ██║    ╚████╔╝ ███████║"));
  console.log(col(c.cyan + c.bold, "  ╚═╝  ╚═╝   ╚═╝     ╚═══╝  ╚══════╝"));
  console.log();
  console.log(col(c.bold, "  Roblox to Visual Studio  -  Installer"));
  console.log(col(c.dim, `  Install directory: ${INSTALL_DIR}`));
  console.log();
}

// ─── Interactive arrow-key menu ──────────────────────────────────────────────

async function selectMenu(question, options, { allowEscape = false } = {}) {
  return new Promise((resolve) => {
    let selected = 0;

    const hint = allowEscape
      ? " (↑↓ arrows, Enter to confirm, Esc to go back):"
      : " (↑↓ arrows, Enter to confirm):";

    const render = () => {
      // Move cursor up by (options.length + 1) if not first render
      if (render.drawn) {
        process.stdout.write(`\x1b[${options.length + 1}A`);
      }
      render.drawn = true;

      console.log(col(c.bold, `? ${question}`) + col(c.dim, hint));
      options.forEach((opt, i) => {
        if (i === selected) {
          console.log(col(c.cyan, `  ▶ ${opt}`));
        } else {
          console.log(`    ${col(c.dim, opt)}`);
        }
      });
    };

    render.drawn = false;
    render();

    if (!isTTY) {
      // Non-interactive fallback: pick first option
      process.stdout.write("\n");
      resolve(options[0]);
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onKey);
    };

    const onKey = (key) => {
      if (key === "\x03") {                 // Ctrl+C
        cleanup();
        process.stdout.write("\n");
        console.log(col(c.dim, "Cancelled."));
        process.exit(0);
      } else if (key === "\x1b[A") {        // Up arrow
        selected = (selected - 1 + options.length) % options.length;
        render();
      } else if (key === "\x1b[B") {        // Down arrow
        selected = (selected + 1) % options.length;
        render();
      } else if (allowEscape && key === "\x1b") { // Bare Escape
        cleanup();
        process.stdout.write("\n");
        resolve(null);
      } else if (key === "\r" || key === "\n") { // Enter
        cleanup();
        process.stdout.write("\n");
        resolve(options[selected]);
      }
    };

    process.stdin.on("data", onKey);
  });
}

// ─── Simple yes/no prompt ────────────────────────────────────────────────────

async function confirm(question, defaultYes = false) {
  const hint = defaultYes ? "(Y/n)" : "(y/N)";
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${col(c.bold, "?")} ${question} ${col(c.dim, hint)} `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

// ─── Status helpers ──────────────────────────────────────────────────────────

const step  = (msg) => console.log(`\n  ${col(c.cyan,   "→")} ${msg}`);
const ok    = (msg) => console.log(`  ${col(c.green,  "✓")} ${msg}`);
const warn  = (msg) => console.log(`  ${col(c.yellow, "!")} ${msg}`);
const fail  = (msg) => console.log(`  ${col(c.red,    "✗")} ${msg}`);
const info  = (msg) => console.log(`  ${col(c.dim,    " ")} ${col(c.dim, msg)}`);

// ─── Shell helpers ───────────────────────────────────────────────────────────

function run(cmd, cwd, label) {
  try {
    execSync(cmd, { cwd, stdio: "inherit", shell: true });
    return true;
  } catch {
    fail(`Command failed: ${label || cmd}`);
    return false;
  }
}

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

// ─── Platform helpers ─────────────────────────────────────────────────────────

const platform = os.platform(); // 'win32' | 'darwin' | 'linux'
const homeDir  = os.homedir();

function getDesktopDir() {
  if (platform === "win32") return path.join(homeDir, "Desktop");
  // XDG_DESKTOP_DIR might be localised (e.g. ~/Escritorio)
  const xdgConfig = path.join(homeDir, ".config", "user-dirs.dirs");
  if (fileExists(xdgConfig)) {
    const content = fs.readFileSync(xdgConfig, "utf8");
    const m = content.match(/XDG_DESKTOP_DIR="?([^"\n]+)"?/);
    if (m) return m[1].replace("$HOME", homeDir);
  }
  return path.join(homeDir, "Desktop");
}

// ─── Install discovery ───────────────────────────────────────────────────────

function isValidInstall(dir) {
  if (!dir || !fileExists(dir)) return false;
  return fileExists(path.join(dir, "installer.mjs")) &&
         fileExists(path.join(dir, "server", "package.json"));
}

function readInstallVersion(dir) {
  const versionFile = path.join(dir, "version.json");
  if (fileExists(versionFile)) {
    try {
      const v = JSON.parse(fs.readFileSync(versionFile, "utf8"));
      if (v && typeof v.version === "string") return v.version;
    } catch {}
  }
  const pkgFile = path.join(dir, "server", "package.json");
  if (fileExists(pkgFile)) {
    try {
      const p = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
      if (p && typeof p.version === "string") return p.version;
    } catch {}
  }
  return null;
}

function candidateInstallDirs() {
  const dirs = [INSTALL_DIR];

  if (platform === "win32") {
    const localApp = process.env.LOCALAPPDATA || path.join(homeDir, "AppData", "Local");
    const userDocs = path.join(homeDir, "Documents");
    dirs.push(
      path.join(localApp, "RtVS"),
      path.join(homeDir, "RtVS"),
      path.join(userDocs, "RtVS"),
      path.join(userDocs, "RtVS_Roblox-To-Visual-Studio"),
    );
  } else {
    dirs.push(
      path.join(homeDir, "RtVS"),
      path.join(homeDir, "RtVS_Roblox-To-Visual-Studio"),
      path.join(homeDir, "Documents", "RtVS"),
      path.join(homeDir, "Documents", "RtVS_Roblox-To-Visual-Studio"),
      path.join(homeDir, ".local", "share", "RtVS"),
    );
  }

  // Shallow glob: any ~/RtVS* or ~/Documents/RtVS* sibling
  const globParents = platform === "win32"
    ? [homeDir, path.join(homeDir, "Documents")]
    : [homeDir, path.join(homeDir, "Documents")];
  for (const parent of globParents) {
    if (!fileExists(parent)) continue;
    try {
      for (const entry of fs.readdirSync(parent)) {
        if (/^RtVS/i.test(entry)) dirs.push(path.join(parent, entry));
      }
    } catch {}
  }

  return dirs;
}

function findInstalls() {
  const seen = new Set();
  const results = [];
  for (const raw of candidateInstallDirs()) {
    let resolved;
    try { resolved = fs.realpathSync(raw); } catch { resolved = path.resolve(raw); }
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (isValidInstall(resolved)) {
      results.push({ path: resolved, version: readInstallVersion(resolved) });
    }
  }
  return results;
}

// ─── Install picker ──────────────────────────────────────────────────────────

async function promptPath(question, { allowEscape = false } = {}) {
  // Raw-mode line editor so we can catch bare ESC as "go back".
  // readline can't distinguish ESC from an arrow-key CSI sequence reliably.
  if (!isTTY) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`  ${col(c.bold, "?")} ${question} `, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  return new Promise((resolve) => {
    const hint = allowEscape ? col(c.dim, " (Esc to go back)") : "";
    process.stdout.write(`  ${col(c.bold, "?")} ${question}${hint} `);

    let buffer = "";

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onKey);
    };

    const onKey = (data) => {
      if (data === "\x03") {                         // Ctrl+C
        cleanup();
        process.stdout.write("\n");
        console.log(col(c.dim, "Cancelled."));
        process.exit(0);
      } else if (allowEscape && data === "\x1b") {   // Bare Escape
        cleanup();
        process.stdout.write("\n");
        resolve(null);
      } else if (data === "\r" || data === "\n") {   // Enter
        cleanup();
        process.stdout.write("\n");
        resolve(buffer.trim());
      } else if (data === "\x7f" || data === "\b") { // Backspace / DEL
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (data.charCodeAt(0) < 32 || data.startsWith("\x1b")) {
        // Other control char or CSI sequence — ignore
      } else {
        buffer += data;
        process.stdout.write(data);
      }
    };

    process.stdin.on("data", onKey);
  });
}

async function pickInstall(action) {
  // Outer loop: re-shows the install picker if the user escapes out of the
  // custom-path prompt. Returns null if the user escapes out of the picker
  // itself (caller should treat that as "back to main menu").
  while (true) {
    const installs = findInstalls();

    console.log();
    if (installs.length === 0) {
      warn("No RtVS installs were auto-detected.");
    } else {
      info(`Found ${installs.length} RtVS install${installs.length === 1 ? "" : "s"}.`);
    }

    const CUSTOM = "Custom location...";
    const options = installs.map(i => {
      const ver = i.version ? `v${i.version}` : "unknown version";
      return `${i.path}  ${col(c.dim, `(${ver})`)}`;
    });
    options.push(CUSTOM);

    const picked = await selectMenu(
      `Select RtVS install to ${action}`,
      options,
      { allowEscape: true }
    );

    if (picked === null) return null;                  // Esc → back to main menu

    if (picked !== CUSTOM) {
      const idx = options.indexOf(picked);
      return installs[idx].path;
    }

    // Custom path loop: Esc here bounces back to the picker above.
    let bounced = false;
    while (true) {
      const entered = await promptPath("Enter RtVS install path:", { allowEscape: true });
      if (entered === null) { bounced = true; break; } // Esc → re-show picker
      if (!entered) {
        fail("No path entered.");
        continue;
      }
      const resolved = path.resolve(entered.replace(/^~(?=$|\/|\\)/, homeDir));
      if (!isValidInstall(resolved)) {
        fail(`Not a valid RtVS install: ${resolved}`);
        info("  (must contain installer.mjs and server/package.json)");
        continue;
      }
      return resolved;
    }
    if (bounced) continue;
  }
}

// ─── Shortcut creation ───────────────────────────────────────────────────────

function detectLinuxTerminal() {
  const candidates = [
    "x-terminal-emulator", "gnome-terminal", "xfce4-terminal",
    "konsole", "xterm",
  ];
  for (const t of candidates) {
    try { execSync(`which ${t}`, { stdio: "ignore" }); return t; } catch {}
  }
  return "xterm";
}

function desktopFileContent(installDir) {
  const terminal = detectLinuxTerminal();
  let execLine;
  if (terminal === "gnome-terminal") {
    execLine = `gnome-terminal -- bash -c "cd ${installDir}/server && npm start; exec bash"`;
  } else if (terminal === "xfce4-terminal") {
    execLine = `xfce4-terminal -e "bash -c \\"cd ${installDir}/server && npm start; exec bash\\""`;
  } else if (terminal === "konsole") {
    execLine = `konsole -e bash -c "cd ${installDir}/server && npm start; exec bash"`;
  } else {
    execLine = `${terminal} -e "bash -c \\"cd ${installDir}/server && npm start; exec bash\\""`;
  }
  return `[Desktop Entry]
Version=1.0
Type=Application
Name=RtVS
GenericName=Roblox to Visual Studio
Comment=Start the RtVS sync server
Exec=${execLine}
Icon=utilities-terminal
Terminal=false
Categories=Development;
Keywords=roblox;studio;sync;
`;
}

function commandFileContent(installDir) {
  return `#!/usr/bin/env bash
# RtVS Launcher
cd "${installDir}/server"
npm start
`;
}

async function createDesktopShortcut(installDir) {
  const desktopDir = getDesktopDir();

  if (platform === "linux") {
    const dest = path.join(desktopDir, "RtVS.desktop");
    if (!fileExists(desktopDir)) fs.mkdirSync(desktopDir, { recursive: true });
    fs.writeFileSync(dest, desktopFileContent(installDir), "utf8");
    try { execSync(`chmod +x "${dest}"`); } catch {}
    ok(`Desktop shortcut → ${dest}`);

  } else if (platform === "darwin") {
    const dest = path.join(desktopDir, "RtVS.command");
    fs.writeFileSync(dest, commandFileContent(installDir), "utf8");
    execSync(`chmod +x "${dest}"`);
    ok(`Desktop shortcut → ${dest}`);

  } else if (platform === "win32") {
    const dest = path.join(desktopDir, "RtVS.lnk");
    const startScript = path.join(installDir, "start-rtvs.bat");
    const ps = `
$WS = New-Object -ComObject WScript.Shell
$SC = $WS.CreateShortcut("${dest.replace(/\\/g, "\\\\")}")
$SC.TargetPath = "${startScript.replace(/\\/g, "\\\\")}"
$SC.WorkingDirectory = "${installDir.replace(/\\/g, "\\\\")}"
$SC.Description = "Start the RtVS sync server"
$SC.Save()
`;
    execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, " ")}"`);
    ok(`Desktop shortcut → ${dest}`);
  }
}

async function createLauncherEntry(installDir) {
  if (platform === "linux") {
    const appDir = path.join(homeDir, ".local", "share", "applications");
    if (!fileExists(appDir)) fs.mkdirSync(appDir, { recursive: true });
    const dest = path.join(appDir, "rtvs.desktop");
    fs.writeFileSync(dest, desktopFileContent(installDir), "utf8");
    // Refresh desktop database if available
    try { execSync("update-desktop-database ~/.local/share/applications", { stdio: "ignore" }); } catch {}
    ok(`App launcher entry → ${dest}`);

  } else if (platform === "darwin") {
    const appsDir = path.join(homeDir, "Applications");
    if (!fileExists(appsDir)) fs.mkdirSync(appsDir, { recursive: true });
    const dest = path.join(appsDir, "RtVS.command");
    fs.writeFileSync(dest, commandFileContent(installDir), "utf8");
    execSync(`chmod +x "${dest}"`);
    ok(`Application entry → ${dest}`);

  } else if (platform === "win32") {
    const startMenuDir = path.join(
      process.env.APPDATA || homeDir,
      "Microsoft", "Windows", "Start Menu", "Programs"
    );
    const dest = path.join(startMenuDir, "RtVS.lnk");
    const startScript = path.join(installDir, "start-rtvs.bat");
    const ps = `
$WS = New-Object -ComObject WScript.Shell
$SC = $WS.CreateShortcut("${dest.replace(/\\/g, "\\\\")}")
$SC.TargetPath = "${startScript.replace(/\\/g, "\\\\")}"
$SC.WorkingDirectory = "${installDir.replace(/\\/g, "\\\\")}"
$SC.Description = "Start the RtVS sync server"
$SC.Save()
`;
    execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, " ")}"`);
    ok(`Start Menu entry → ${dest}`);
  }
}

function createStartScript(installDir) {
  if (platform === "win32") {
    const dest = path.join(installDir, "start-rtvs.bat");
    fs.writeFileSync(dest, `@echo off\ncd /d "${installDir}\\server"\nnpm start\npause\n`);
    ok(`Launch script → ${dest}`);
  } else {
    const dest = path.join(installDir, "start-rtvs.sh");
    fs.writeFileSync(dest, `#!/usr/bin/env bash\ncd "${installDir}/server"\nnpm start\n`);
    execSync(`chmod +x "${dest}"`);
    ok(`Launch script → ${dest}`);
  }
}

// ─── Shortcut removal ────────────────────────────────────────────────────────

function removeIfExists(p, label) {
  if (fileExists(p)) {
    fs.rmSync(p, { force: true });
    ok(`Removed: ${label}`);
  }
}

function removeShortcuts(installDir) {
  const desktop = getDesktopDir();

  if (platform === "linux") {
    removeIfExists(path.join(desktop, "RtVS.desktop"), "desktop shortcut");
    removeIfExists(path.join(homeDir, ".local", "share", "applications", "rtvs.desktop"), "app launcher entry");
    try { execSync("update-desktop-database ~/.local/share/applications", { stdio: "ignore" }); } catch {}
  } else if (platform === "darwin") {
    removeIfExists(path.join(desktop, "RtVS.command"), "desktop shortcut");
    removeIfExists(path.join(homeDir, "Applications", "RtVS.command"), "Applications entry");
  } else if (platform === "win32") {
    removeIfExists(path.join(desktop, "RtVS.lnk"), "desktop shortcut");
    const sm = path.join(process.env.APPDATA || homeDir, "Microsoft", "Windows", "Start Menu", "Programs", "RtVS.lnk");
    removeIfExists(sm, "Start Menu entry");
  }
}

// ─── Install ─────────────────────────────────────────────────────────────────

async function install() {
  console.log();
  console.log(col(c.bold, "  Installing RtVS"));
  console.log(col(c.dim,  "  " + "─".repeat(44)));

  step("Installing server dependencies…");
  if (!run("npm install", path.join(INSTALL_DIR, "server"), "npm install")) {
    fail("Installation failed - check the error above.");
    process.exit(1);
  }
  ok("Dependencies installed.");

  step("Deploying Roblox Studio plugin…");
  if (!run("npm run deploy", path.join(INSTALL_DIR, "server"), "npm run deploy")) {
    warn("Plugin deploy failed. You can re-run it later with: npm run deploy");
  } else {
    ok("Plugin deployed to Roblox Studio.");
  }

  step("Creating launch script…");
  try {
    createStartScript(INSTALL_DIR);
  } catch (e) {
    warn(`Could not create launch script: ${e.message}`);
  }

  console.log();

  const wantDesktop = await confirm("Create a desktop shortcut?", false);
  if (wantDesktop) {
    try { await createDesktopShortcut(INSTALL_DIR); }
    catch (e) { warn(`Desktop shortcut failed: ${e.message}`); }
  }

  const launcherLabel = platform === "win32" ? "Add to Start Menu?" :
                        platform === "darwin" ? "Add to Applications folder?" :
                        "Add to app launcher?";
  const wantLauncher = await confirm(launcherLabel, false);
  if (wantLauncher) {
    try { await createLauncherEntry(INSTALL_DIR); }
    catch (e) { warn(`Launcher entry failed: ${e.message}`); }
  }

  console.log();
  console.log(col(c.green + c.bold, "  ✓ RtVS installed successfully!"));
  console.log();
  console.log(col(c.bold, "  Next steps:"));

  const launchCmd = platform === "win32"
    ? `  start-rtvs.bat`
    : `  ./start-rtvs.sh`;

  if (wantDesktop) {
    info("  • Launch via the desktop shortcut, or:");
  }
  info(`  • Run: ${launchCmd}`);
  info("  • Open Roblox Studio and use the RtVS plugin toolbar");
  info("  • See QUICKSTART.md for usage instructions");
  console.log();
}

// ─── Update ──────────────────────────────────────────────────────────────────

async function update(targetDir) {
  console.log();
  console.log(col(c.bold, "  Updating RtVS"));
  console.log(col(c.dim,  "  " + "─".repeat(44)));
  info(`Target: ${targetDir}`);

  step("Checking for updates and downloading latest files…");
  if (!run("npm run update", path.join(targetDir, "server"), "npm run update")) {
    fail("Update failed - check the error above.");
    process.exit(1);
  }

  console.log();
  console.log(col(c.green + c.bold, "  ✓ Update complete."));
  console.log();
}

// ─── Repair ──────────────────────────────────────────────────────────────────

async function repair(targetDir) {
  console.log();
  console.log(col(c.bold, "  Repairing RtVS"));
  console.log(col(c.dim,  "  " + "─".repeat(44)));
  info(`Target: ${targetDir}`);

  step("Re-installing server dependencies…");
  if (!run("npm install", path.join(targetDir, "server"), "npm install")) {
    fail("npm install failed - check the error above.");
    process.exit(1);
  }
  ok("Dependencies installed.");

  step("Re-deploying Roblox Studio plugin…");
  if (!run("npm run deploy", path.join(targetDir, "server"), "npm run deploy")) {
    warn("Plugin deploy failed. Try running manually: cd server && npm run deploy");
  } else {
    ok("Plugin re-deployed.");
  }

  console.log();
  console.log(col(c.green + c.bold, "  ✓ Repair complete."));
  console.log();
}

// ─── Uninstall ───────────────────────────────────────────────────────────────

async function uninstall(targetDir) {
  console.log();
  console.log(col(c.bold, "  Uninstalling RtVS"));
  console.log(col(c.dim,  "  " + "─".repeat(44)));
  info(`Target: ${targetDir}`);

  step("Removing shortcuts…");
  try { removeShortcuts(targetDir); }
  catch (e) { warn(`Some shortcuts could not be removed: ${e.message}`); }

  console.log();
  const removeFiles = await confirm(
    `Remove installed files? ${col(c.dim, `(${targetDir})`)}`,
    false
  );

  if (removeFiles) {
    step("Removing files…");
    if (platform === "win32") {
      run(`rmdir /s /q "${targetDir}"`, os.homedir(), "remove files");
    } else {
      run(`rm -rf "${targetDir}"`, os.homedir(), "remove files");
    }
    console.log();
    console.log(col(c.green + c.bold, "  ✓ RtVS has been uninstalled."));
  } else {
    console.log();
    console.log(col(c.dim, "  Shortcuts removed. Files kept."));
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  // Quick sanity check
  const serverDir = path.join(INSTALL_DIR, "server");
  if (!fileExists(serverDir)) {
    fail(`Could not find server directory at: ${serverDir}`);
    fail("Make sure you're running this from the RtVS install directory.");
    process.exit(1);
  }

  while (true) {
    const action = await selectMenu("What would you like to do", [
      "Install RtVS",
      "Update RtVS",
      "Repair RtVS",
      "Uninstall RtVS",
      "Exit",
    ], { allowEscape: true });

    if (action === null || action === "Exit") {
      console.log(col(c.dim, "  Bye."));
      return;
    }

    if (action === "Install RtVS") {
      await install();
      return;
    }

    const verb = action === "Update RtVS" ? "update"
               : action === "Repair RtVS" ? "repair"
               : "uninstall";
    const target = await pickInstall(verb);
    if (target === null) continue; // Esc out of picker → back to main menu

    if (action === "Update RtVS")    await update(target);
    if (action === "Repair RtVS")    await repair(target);
    if (action === "Uninstall RtVS") await uninstall(target);
    return;
  }
}

main().catch((err) => {
  console.error(`\n  ${c.red}Fatal error:${c.reset}`, err.message || err);
  process.exit(1);
});
