# RtVS Quickstart Guide

![RtVS Logo](https://cdn.catman6112.dev/Images/RtVS.png)

Get RtVS installed and syncing in under 5 minutes.

## Step 0: Install RtVS

Run the one-line installer. It handles Node.js, dependencies, plugin deployment, and optional shortcuts.

**Linux / macOS**:
```bash
sh -c "$(curl -sS https://raw.githubusercontent.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/main/install.sh)"
```

**Windows**:
```powershell
irm https://raw.githubusercontent.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/main/install.ps1 | iex
```

Follow the prompts. Once done, skip to [Step 2: Start the Server](#2-start-the-server).

## Manual Installation

If you prefer to install manually:

## 1. Install the Plugin

### Option A: Automated Build

```bash
cd server
npm install
npm run deploy
```

This builds the plugin and installs it to your Roblox plugins folder. Restart Studio or press Ctrl+Shift+L to reload.

### Option B: Manual Installation

1. Open Roblox Studio
2. In ServerStorage, create a Folder named "RtVS-Plugin"
3. Create these scripts inside it:
   - Script "main" with `/plugin/main.lua`
   - ModuleScript "deserializer" with `/plugin/deserializer.lua`
   - ModuleScript "studio-watcher" with `/plugin/studio-watcher.lua`
4. Right-click "RtVS-Plugin" and select "Save as Local Plugin..."
5. Save it as "RtVS"
6. Restart Studio or press Ctrl+Shift+L

## 2. Start the Server

After installing the plugin, start the synchronization server:

```bash
cd server
npm install  # First time only
npm start
```

The server will start on `http://localhost:8080`. Keep this running while using the plugin.

## 3. Verify Connection

1. Open Roblox Studio
2. Check the Output window for: `RtVS Server connected`
3. If you see an error:
   - Make sure the server is running on `http://localhost:8080`
   - Check that HttpService is enabled in Studio
   - Verify plugin and server versions match

## 4. Initial Sync

When first using RtVS with a project, you need to create the initial file structure:

1. Click the **"Full Sync"** button once
2. Read the warning in the Output window
3. Click **"Full Sync"** again within 3 seconds to confirm
4. Wait for the sync to complete

This creates the `/synced-game` folder with your entire game tree.

## 5. Choose Your Workflow

### Studio Priority (Studio → Files)

1. Click **"Prioritize Studio"** button
2. Make changes in Studio
3. Changes sync to `/synced-game` folder instantly
4. Click again to disable

### Server Priority (Files → Studio)

1. Click **"Prioritize Server"** button
2. Edit files in your code editor
3. Changes appear in Studio within 2 seconds
4. Click again to disable

Only one mode can be active at a time.

## 6. Version Control Setup

```bash
cd synced-game
git init
git add .
git commit -m "Initial game state"
```

Always commit to Git before using Full Sync to avoid data loss.

## Troubleshooting

**Server Not Connected:**
```bash
cd server
npm start
```

**Changes Not Syncing:**
- Check that the correct mode is enabled
- Verify server is running
- Check Output window for error messages

**Version Mismatch:**
- Update plugin: `npm run deploy`
- Update server: `git pull && npm install && npm start`

See `/plugin/README.md` for detailed usage information.

