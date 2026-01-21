# RtVS Quickstart Guide

![RtVS Logo](https://cdn.catman6112.dev/Images/RtVS.png)

Get RtVS installed and syncing in under 5 minutes.

## 1. Install the Plugin

### Option A: Automated Build (Recommended)

Build and install from source using the automated deployment:

```bash
cd server
npm install
npm run deploy
```

This will:
1. Build the plugin from source
2. Generate an `.rbxm` binary file
3. Automatically install it to your Roblox plugins folder:
   - **Windows:** `%LOCALAPPDATA%\Roblox\Plugins\RtVS.rbxm`
   - **macOS:** `~/Documents/Roblox/Plugins/RtVS.rbxm`

After installation, restart Roblox Studio or press **Ctrl+Shift+L** to reload plugins.

### Option B: Manual Installation (Advanced)

If automatic deployment fails:

1. Open Roblox Studio
2. In ServerStorage, create a Folder named "RtVS-Plugin"
3. Inside that folder, create three scripts:
   - Script named "main" - paste contents of `/plugin/main.lua`
   - ModuleScript named "deserializer" - paste contents of `/plugin/deserializer.lua`
   - ModuleScript named "studio-watcher" - paste contents of `/plugin/studio-watcher.lua`
4. Right-click the "RtVS-Plugin" folder
5. Select "Save as Local Plugin..."
6. Save it as "RtVS"
7. Restart Studio or press Ctrl+Shift+L (Cmd+Shift+L on Mac)

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
2. Check the Output window for: `RtVS Server connected (v0.1.1)`
3. If you see this message, you're ready to go

If you see an error:
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

### Workflow A: Working in Studio (Studio → Files)

Use this when building and prototyping in Roblox Studio:

1. Click **"Prioritize Studio"** button (it will highlight)
2. Make changes in Studio (create objects, edit scripts, modify properties)
3. Changes are instantly synced to `/synced-game` folder
4. Click the button again to disable when done

### Workflow B: Working in External Editor (Files → Studio)

Use this when coding in VS Code, Sublime, or other editors:

1. Click **"Prioritize Server"** button (it will highlight)
2. Open `/synced-game` folder in your code editor
3. Edit `.lua` or `.json` files and save
4. Changes appear in Studio within 2 seconds
5. Click the button again to disable when done

**Important**: Only one mode can be active at a time. Enabling one automatically disables the other.

## 6. Version Control Setup (Recommended)

Initialize Git in your synced game folder:

```bash
cd synced-game
git init
git add .
git commit -m "Initial game state"
```

Now you can use Git for version control:
- Track all changes to your game
- Use branches for feature development
- Collaborate with team members
- Revert to previous versions

**Critical**: Always commit to Git before using Full Sync to avoid data loss.

## Common Workflows

### Switching Between Studio and External Editor

1. Disable current mode (click the highlighted button)
2. Enable the other mode (click the other button)
3. Continue working

### When Not Using RtVS

If you're not actively syncing:

1. Disable both modes (no buttons highlighted)
2. Stop the server with `Ctrl+C`
3. Use Studio normally
4. Restart server and run Full Sync when you return

### Troubleshooting

**Server Not Connected:**
```bash
cd server
npm start
```

**Changes Not Syncing:**
- Check that the correct mode is enabled (button highlighted)
- Verify server is running
- Check Output window for error messages

**Version Mismatch:**
- Update plugin: `npm run deploy` from `/server` directory
- Update server: `git pull && npm install && npm start`

## Next Steps

For detailed usage information, see `/plugin/README.md`

For technical details about file formats and plugin internals, see the plugin documentation.

