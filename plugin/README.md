# RtVS Plugin Documentation

![RtVS Logo](https://cdn.catman6112.dev/Images/RtVS.png)

### 1. Start the Server

```bash
cd server
npm install
npm start
```
This installs all necessary packages and starts the server.

The server will be reachable at `http://localhost:8080`

### 2. Load the Plugin in Roblox Studio
### Option A: (Reccomended)
Install the official plugin:

[Here!](https://create.roblox.com/store/asset/109193856190560/RtVS-Official-Plugin)

### Option B: (Advanced)
"Build" and use the plugin from source
1. Open **Any Instance** in Roblox Studio 
2. In **ServerStorage**, create a **Folder** named "RtVS-Plugin"
3. Inside that folder, create:
   - A **ModuleScript** named "deserializer" - paste contents of `/plugin/deserializer.lua`
   - A **ModuleScript** named "studio-watcher" - paste contents of `/plugin/studio-watcher.lua`
   - A **Script** named "main" - paste contents of `/plugin/main.lua`

4. Right-click the "RtVS-Plugin" folder
5. Select **"Save as Local Plugin..."**
6. Save it as "RtVS"
7. Restart Roblox Studio

### Initial Setup
(please follow ```QUICKSTART.md``` for more detailed info)

1. Start the RtVS server:
```bash
cd server
npm install  # First time only
npm start
```

2. Open Roblox Studio - the plugin will automatically connect to the server

3. You should see three new buttons in the toolbar under "RtVS Sync":
   - **Prioritize Studio**
   - **Prioritize Server** 
   - **Full Sync** 

## Sync Modes

The plugin has two mutually exclusive sync modes. Only one can be active at a time.

### Prioritize Studio Mode (Studio → Files)

**What it does**: Makes Roblox Studio the single source of truth. Any changes you make in Studio are automatically sent to the file system.

**When to use**:
- When you're primarily working in Roblox Studio
- When you want to quickly prototype inside Studio
- When you're making visual changes, moving objects, or tweaking properties

**How to enable**:
1. Click the **"Prioritize Studio"** button in the RtVS Sync toolbar
2. The button will highlight/activate
3. Any subsequent changes in Studio will be sent to the server immediately

**What happens**:
- Changes in Studio → instantly synced to files
- Changes in files → **ignored** (won't affect Studio)
- Studio watches for:
  - Property changes (Color, Size, Position, etc.)
  - Script source code changes
  - New objects created
  - Objects deleted
  - Attribute changes

**To disable**: Click the "Prioritize Studio" button again to deactivate it.

---

### Prioritize Server Mode (Files → Studio)

**What it does**: Makes the file system the single source of truth. Any changes you make to files (in VS Code, Sublime, etc.) are automatically applied to Studio.

**When to use**:
- When you're coding in an external editor (VS Code, IntelliJ, etc.)
- When you want to use Git features (branches, pull requests, merges)
- When you need advanced editor features (IntelliSense, linting, extensions)
- Using AI Agents like Claude or Codex

**How to enable**:
1. Click the **"Prioritize Server"** button in the RtVS Sync toolbar
2. The button will highlight/activate
3. The plugin starts polling the server every 2 seconds for file changes
4. Any file changes are automatically applied to Studio

**What happens**:
- Changes in files → synced to Studio every 2 seconds
- Changes in Studio → **ignored** (won't affect files)
- **Script editors auto-close**: When files change, any open script editors will close automatically to prevent stale edits

**To disable**: Click the "Prioritize Server" button again to deactivate it.

---

### Full Sync (One-Time Complete Overwrite)

**What it does**: Performs a complete one-way sync from Studio to the file system, overwriting ALL files on the server with the current Studio state.

**WARNING**: This is a DESTRUCTIVE operation! Any unsynced changes in Studio to your files will be PERMANENTLY LOST.

**When to use**:
- Initial Sync
- When you've made extensive changes in Studio, havent had **Prioritize Sever** enabled and want to completely replace the file system
- When recovering from a corrupted file system state
- When you want to ensure files are 100% in sync with Studio (clean slate)
- After major refactoring or restructuring in Studio

**How to use**:
1. **IMPORTANT**: Ensure all file changes are relaibly version controlled / backed up BEFORE using Full Sync
2. Click the **"Full Sync"** button in the RtVS Sync toolbar
3. A warning will appear in the Output window:
   ```
   FULL SYNC WARNING
   This will OVERWRITE all files on the server!
   Any unsynced changes will be PERMANENTLY LOST!

   STRONGLY RECOMMENDED: Commit to Git first!

   Click 'Full Sync' button AGAIN within 3 seconds to confirm
   ```
4. **Click the "Full Sync" button AGAIN within 3 seconds** to confirm and proceed
5. If you wait longer than 3 seconds, you'll need to start over (safety feature)

**What happens**:
- All game services read from Studio
- Complete JSON serialization of the entire game tree
- All files in `/synced-game` are overwritten
- Any file changes not committed to Git will be lost

**Best Practices**:
- Commit to Git before using Full Sync
- Use Full Sync sparingly - prefer Prioritize Studio mode for normal work
- Consider Full Sync as a "reset to Studio state" operation

---

## Workflow Examples

### Example 1: Coding in VS Code

1. Enable **Prioritize Server** mode
2. Open your selected `/synced-game` folder in VS Code
3. Edit any `.lua` or `.json` files
4. Save your changes
5. Within 2 seconds, Studio will update automatically
6. Open script tabs that have changed will close automatically

### Example 2: Building in Studio

1. Enable **Prioritize Studio** mode
2. Create, move, and modify objects in Studio
3. Changes are immediately sent to the file system


### Example 3: Switching Between Modes

**Scenario**: You're coding in VS Code but need to make a quick visual change in Studio.

1. **Disable** Prioritize Server mode (click the button to deactivate)
2. **Enable** Prioritize Studio mode
3. Make your visual changes in Studio
4. **Disable** Prioritize Studio mode
5. **Re-enable** Prioritize Server mode to resume external editing

**Important**: Only one mode can be active at a time. Enabling one will automatically disable the other.

### Example 4: Using Full Sync After Major Changes

**Scenario**: You've completely restructured your game in Studio and want to ensure files match exactly.

1. **Commit** all current file changes to Git (if any)
2. Make your major changes in Studio (restructure, delete, refactor)
3. Click the **"Full Sync"** button once
4. Read the warning in the Output window carefully
5. Click the **"Full Sync"** button AGAIN within 3 seconds to confirm
6. Check the Output window for completion message
7. Review `git diff` to see all changes
8. Commit the new file structure to Git

**Critical**: Full Sync is destructive - always commit to Git first!

### Example 5: You Aren't Currently Making Scripting Related Changes or Aren't Backing Up Your Game via Version Control 

1. Simply disabled the in-use sync zone by clicking the enabled one (button should no longer by highlighted)

2. Shut down the server via ```Ctrl/⌘+C```

3. Use Studio as normal and do a full sync once you return.
---

## File Structure

The plugin syncs to the `/synced-game` folder with this structure:

```
/synced-game
  /Workspace
    /MyPart
      __main__.json        # Part properties
    /MyScript.lua          # Standalone script
    /MyFolder
      __main__.json        # Folder properties
      /ChildScript
        __main__.lua       # Script with children
        __main__.json      # Script properties
  /ServerScriptService
    MainScript.lua
  /ReplicatedStorage
  index.json              # Complete hierarchy map
```

### File Types

- **`.lua` files**: Script source code (Script, LocalScript, ModuleScript)
- **`__main__.json` files**: Object properties (Name, ClassName, Position, Color, etc.)
- **`index.json`**: Complete game hierarchy (automatically generated)

---

## Script Editor Auto-Close

When **Prioritize Server** mode is enabled, the plugin automatically closes all open script editors when files change. This prevents you from editing stale code.

**Why this happens**:
- Roblox Studio caches script content in open editor tabs
- If a file changes externally, the open tab would show outdated code
- Closing and reopening the script ensures you see the latest version

**What to do**:
- After making external changes, simply re-open the script in Studio
- The script will now show the updated content

---

## Troubleshooting

### Server Not Connected

**Error**: `RtVS Server not running`

**Solution**:
```bash
cd server
npm start
```

### Changes Not Syncing

**Check**:
1. Is the correct mode enabled? (Check button highlight)
2. Is the server running?
3. Check the Output window for error messages

### Script Editors Keep Closing

**This is expected behavior** when Prioritize Server mode is enabled and files change. The plugin closes editors to prevent stale code edits.

**Solution**: Re-open the script after changes are applied.

---

## Best Practices

### DO:
- Use **one mode at a time** - don't switch rapidly
- **Always commit to Git or another version control program before using Full Sync** - this cannot be stressed enough!
- Commit your files to Git or another version control program before switching modes
- Check the Output window for sync confirmation messages
- Close Studio scripts before making external edits (in Prioritize Server mode)
- Use Full Sync only when you need a complete clean slate

### DON'T:
- Use Full Sync without committing to Git or another version control program first
- Edit both in Studio AND externally simultaneously
- Switch modes while making changes (finish your work first)
- Ignore error messages in the Output window
- Delete the `/synced-game` folder while the plugin is active
- Use Full Sync as your primary sync method (use Prioritize Studio instead)

---

## Development & Debugging

### Enable Plugin Debugging

1. Go to **File → Studio Settings → Studio**
2. Enable **"Plugin Debugging Enabled"**
3. Use the PluginDebugService to debug your plugin

### Reload Plugin

Press **Ctrl+Shift+L** (or **Cmd+Shift+L** on Mac) to reload all plugins without restarting Studio.

### Check Output

Open the **Output** window to see plugin logs:
- Connection status
- Sync operations
- File changes being applied
- Any errors or warnings

---

## Technical Details

### Prioritize Studio Mode (Technical)

- Uses Roblox's `Changed`, `ChildAdded`, `ChildRemoved`, `DescendantAdded`, `DescendantRemoving` events
- Watches all 13 major game services (Workspace, ReplicatedStorage, etc.)
- Sends individual file changes via `POST /studio-change` endpoint
- Server temporarily pauses file watcher to prevent circular updates

### Prioritize Server Mode (Technical)

- Plugin polls `GET /changes` endpoint every 2 seconds
- Server uses `chokidar` to watch for file system changes
- Changes are queued and sent with file content
- ScriptEditorService API closes open script documents before applying changes

---

## Files

- **main.lua** - Main plugin entry point with priority mode buttons and sync logic
- **deserializer.lua** - Module for applying file changes to Studio instances
- **studio-watcher.lua** - Module for watching Studio changes and sending to server
- **workspace-reader.lua** - Legacy file (kept for reference, functionality now in main.lua)

---

## Version

Plugin Version: 0.1.1 (Public Beta!)

### Version Compatibility

The plugin performs automatic version checking on startup to ensure compatibility with the server. Both the plugin and server must be running the same version to function correctly.

**What happens on startup**:
1. Plugin connects to server via `GET /ping`
2. Server responds with its version number
3. Plugin compares versions and checks for compatibility

**If versions match**:
- Plugin displays: `RtVS Server connected (v0.1.1)`
- All functionality enabled normally

**If plugin is outdated** (plugin version < server version):
```
========================================
OUTDATED PLUGIN
========================================
Outdated Plugin!! Please Update via Plugin Manager on the Plugins Tab!
If there is no new plugin, wait about an hour and come back.
Plugin functionality has been suspended.
========================================
Plugin Version: 0.1.0
Server Version: 0.1.1
========================================
```

**Solution**: Update the plugin via the Plugin Manager in Roblox Studio. If the update isn't available yet, wait about an hour for the Roblox plugin store to propagate the update.

**If server is outdated** (server version < plugin version):
```
========================================
OUTDATED SERVER
========================================
Outdated Server!! Please Update Via Github at
https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/!!
Plugin Functionality has been Suspended!!
========================================
Plugin Version: 0.1.1
Server Version: 0.1.0
========================================
```

**Solution**: Update the server by pulling the latest version from GitHub:
```bash
cd server
git pull origin main
npm install
npm start
```

**Important**: When a version mismatch is detected, all plugin functionality is suspended. You cannot use Prioritize Studio, Prioritize Server, or Full Sync until versions are matched.

### Use of AI
As much as I despise AI and how it's destroying creative work, I think there's use in it for inteligent reptitve tasks such as writing documentation.

This document was originally generated by an agent and has been **heavily** edited and proof-read by myself to ensure it's accurate and helpful.

If you'd like to re-write it yourself or make changes, feel free to open a PR.
