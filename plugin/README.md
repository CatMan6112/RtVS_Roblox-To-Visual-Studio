# RtVS Plugin Documentation

![RtVS Logo](https://cdn.catman6112.dev/Images/RtVS.png)

This document explains how the RtVS plugin works, the file format it uses, and detailed usage workflows.

For installation instructions, see QUICKSTART.md in the root directory.

## Overview

The RtVS plugin provides bidirectional synchronization between Roblox Studio and your file system.

## File Structure Format

The plugin syncs to the `/synced-game` folder with the following structure:

```
/synced-game
  /Workspace
    /MyPart
      __main__.json        # Part properties
    /MyScript.lua          # Standalone script (no children)
    /MyFolder
      __main__.json        # Folder properties
      /ChildScript
        __main__.lua       # Script with children
        __main__.json      # Script properties
        NestedScript.lua   # Child script
  /ServerScriptService
    MainScript.lua
  /ReplicatedStorage
  index.json              # Complete hierarchy map
```

### File Types

**`.lua` files**: Standalone script source code (scripts with no children)

**`__main__.lua`**: Script source code when the script has children

**`__main__.json`**: Object properties and metadata

**`index.json`**: Complete hierarchy map at the root level


## Sync Modes

The plugin has three primary operations:

### 1. Prioritize Studio (Studio → Files)

**Purpose**: Makes Roblox Studio the single source of truth.

**How it works**:
- Plugin watches all 13 game services using Roblox events:
  - `Changed` - Property changes
  - `ChildAdded` - New objects created
  - `DescendantAdded` - New descendants added anywhere
  - `ChildRemoved` - Objects deleted
  - `DescendantRemoving` - Descendants removed
- Each change is immediately sent to server via `POST /studio-change`
- Server writes individual file changes
- File watcher is paused during writes to prevent circular updates

**When to use**:
- Building and prototyping in Studio
- Making visual changes (moving objects, tweaking properties)
- Creating new objects or restructuring hierarchy
- Quick iterations inside Studio

**What gets synced**:
- Property changes (Color, Size, Position, Material, etc.)
- Script source code edits
- New objects created
- Objects deleted or moved
- Attribute changes

**File changes are ignored**: Changes made to files while this mode is active will not affect Studio.

### 2. Prioritize Server (Files → Studio)

**Purpose**: Makes the file system the single source of truth.

**How it works**:
- Plugin polls `GET /changes` endpoint every 2 seconds
- Server watches file system with `chokidar` library
- File changes are queued with content
- Plugin receives changes and applies them to Studio
- Script editors are closed before applying changes (prevents stale edits)

**When to use**:
- Coding in external editor (VS Code, IntelliJ, etc.)
- Using Git features (branches, merges, pull requests)
- Leveraging AI coding assistants
- Using advanced editor features (linting, IntelliSense, extensions)

**What gets synced**:
- `.lua` file changes → Script source updates
- `__main__.json` changes → Property updates
- New files → New instances created
- Deleted files → Instances removed

**Studio changes are ignored**: Changes made in Studio while this mode is active will not affect files.

**Script Editor Auto-Close**: When files change, all open script editors close automatically to prevent editing stale cached content. Simply reopen the script after changes are applied to see the latest version.

### 3. Full Sync (One-Time Complete Overwrite)

**Purpose**: Performs a complete one-way sync from Studio to files, overwriting everything.

**How it works**:
- Reads all 13 game services recursively
- Serializes entire game tree to JSON
- Sends complete data via `POST /sync`
- Server deletes and recreates all files in `/synced-game`

**When to use**:
- Initial sync when first using RtVS
- After major restructuring in Studio
- Recovering from corrupted file system state
- Ensuring files are 100% in sync with Studio (clean slate)

**WARNING**: This is DESTRUCTIVE. Any uncommitted file changes will be permanently lost.

**Safety mechanism**:
1. Click "Full Sync" once
2. Warning appears in Output window
3. Click "Full Sync" again within 3 seconds to confirm
4. If you wait longer than 3 seconds, confirmation expires (safety feature)

**Best practice**: Always commit to Git before using Full Sync.

## Monitored Game Services

The plugin monitors these 13 Roblox services:

1. **Workspace** - Game world and 3D objects
2. **ReplicatedStorage** - Shared assets (client + server)
3. **ReplicatedFirst** - Assets loaded before game starts
4. **ServerScriptService** - Server-side scripts
5. **ServerStorage** - Server-only assets
6. **StarterGui** - Player GUI templates
7. **StarterPack** - Player starting tools
8. **StarterPlayer** - Player spawn settings
9. **Lighting** - Lighting and atmosphere
10. **SoundService** - Global sound settings
11. **Chat** - Chat configuration
12. **LocalizationService** - Localization settings
13. **TestService** - Testing utilities

## Workflow Examples

### Example 1: Coding in VS Code

```
1. Enable "Prioritize Server" mode (button highlights)
2. Open /synced-game folder in VS Code
3. Edit MainScript.lua
4. Save file (Ctrl+S)
5. Within 2 seconds, Studio updates
6. Any open script tabs close automatically
7. Reopen script in Studio to see changes
```

### Example 2: Building in Studio

```
1. Enable "Prioritize Studio" mode (button highlights)
2. Create new Part in Workspace
3. Immediately synced to /synced-game/Workspace/Part/
4. Change Part color in Properties
5. Immediately synced to __main__.json
6. Delete Part
7. Immediately removed from file system
```

### Example 3: Switching Between Modes

**Scenario**: Coding in VS Code, need to make quick visual change in Studio.

```
1. Disable "Prioritize Server" mode (click button)
2. Enable "Prioritize Studio" mode (click button)
3. Make visual changes in Studio
4. Changes sync to files
5. Disable "Prioritize Studio" mode
6. Enable "Prioritize Server" mode
7. Resume coding in VS Code
```

**Important**: Only one mode can be active at a time. Enabling one automatically disables the other.

### Example 4: Using Full Sync

**Scenario**: Major refactoring in Studio, want files to match exactly.

```
1. Commit all current file changes to Git
2. Make major changes in Studio (restructure, delete, refactor)
3. Click "Full Sync" button once
4. Read warning carefully in Output window
5. Click "Full Sync" button again within 3 seconds
6. Wait for sync to complete
7. Check git diff to see all changes
8. Commit new file structure to Git
```

### Example 5: Not Using RtVS

**Scenario**: Working on non-scripting tasks, don't need sync.

```
1. Disable active sync mode (click highlighted button)
2. Stop server (Ctrl+C in terminal)
3. Use Studio normally
4. When ready to resume:
   - Start server (npm start)
   - Run Full Sync to ensure files match Studio
   - Enable desired sync mode
```

## Technical Details

### Prioritize Studio Mode (Technical)

**Event-based watching**:
```lua
-- Watches these events on all 13 services
service.Changed:Connect(onPropertyChanged)
service.ChildAdded:Connect(onChildAdded)
service.ChildRemoved:Connect(onChildRemoved)
service.DescendantAdded:Connect(onDescendantAdded)
service.DescendantRemoving:Connect(onDescendantRemoving)
```

**Communication**:
- Endpoint: `POST /studio-change`
- Payload: Individual change data (one property or one object)
- Response: Success confirmation

**Server behavior**:
- Pauses file watcher during write
- Writes single file change
- Resumes file watcher after write
- Prevents circular updates

### Prioritize Server Mode (Technical)

**Polling mechanism**:
```lua
-- Runs every 2 seconds while mode is active
while prioritizeServerEnabled do
    local changes = HttpService:GetAsync(serverUrl .. "/changes")
    applyChangesToStudio(changes)
    wait(2)
end
```

**Script editor closing**:
```lua
-- Uses ScriptEditorService API
local ScriptEditorService = game:GetService("ScriptEditorService")
local openDocuments = ScriptEditorService:GetScriptDocuments()
for _, doc in ipairs(openDocuments) do
    doc:CloseAsync()
end
```

**Communication**:
- Endpoint: `GET /changes`
- Response: Array of file changes with content
- Polling interval: 2 seconds

### Full Sync (Technical)

**Serialization**:
```lua
-- Recursive function reads entire tree
function serializeInstance(instance)
    local data = {
        ClassName = instance.ClassName,
        Name = instance.Name,
        Properties = getProperties(instance),
        Children = {}
    }
    for _, child in ipairs(instance:GetChildren()) do
        table.insert(data.Children, serializeInstance(child))
    end
    return data
end
```

**Communication**:
- Endpoint: `POST /sync`
- Payload: Complete game tree JSON (can be 100KB+ for large games)
- Response: Success confirmation

## Version Compatibility

The plugin performs automatic version checking on startup.

**On connection**:
1. Plugin sends `GET /ping` to server
2. Server responds with `{ status: "ok", version: "0.1.2" }`
3. Plugin compares versions

**If versions match**:
```
RtVS Server connected (v0.1.2)
```

**If plugin is outdated**:
```
========================================
OUTDATED PLUGIN
========================================
Outdated Plugin!! Please Update via Plugin Manager on the Plugins Tab!
If there is no new plugin, wait about an hour and come back.
Plugin functionality has been suspended.
========================================
Plugin Version: 0.1.0
Server Version: 0.1.2
========================================
```

**If server is outdated**:
```
========================================
OUTDATED SERVER
========================================
Outdated Server!! Please Update Via Github at
https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/!!
Plugin Functionality has been Suspended!!
========================================
Plugin Version: 0.1.2
Server Version: 0.1.0
========================================
```

**When version mismatch is detected**: All plugin functionality is suspended. Cannot use any sync modes until versions match.

## Plugin Files

**main.lua**: Main entry point with toolbar UI and sync orchestration

**deserializer.lua**: Applies file changes to Studio instances

**studio-watcher.lua**: Watches Studio for changes and sends them to server

## Best Practices

### DO:
- Use one sync mode at a time
- Commit to Git before using Full Sync
- Check Output window for sync messages
- Close script editors before making external edits (in Prioritize Server mode)
- Use Full Sync only when you need a complete clean slate

### DON'T:
- Use Full Sync without committing to Git first
- Edit both in Studio and externally simultaneously
- Switch modes while making changes
- Ignore error messages in Output window
- Delete `/synced-game` folder while plugin is active
- Use Full Sync as your primary sync method (use Prioritize Studio instead)

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
1. Is the correct mode enabled? (Button highlighted)
2. Is the server running?
3. Check Output window for error messages

### Script Editors Keep Closing

**This is expected behavior** when Prioritize Server mode is enabled and files change.

**Reason**: Roblox Studio caches script content in open editor tabs. If a file changes externally, the open tab shows outdated code.

**Solution**: Reopen the script after changes are applied.

### Version Mismatch

**Solution for outdated plugin**:
```bash
cd server
npm run deploy
```

**Solution for outdated server**:
```bash
cd server
git pull
npm install
npm start
```

## Development & Debugging

### Enable Plugin Debugging

1. Go to **File → Studio Settings → Studio**
2. Enable **"Plugin Debugging Enabled"**
3. Use PluginDebugService for debugging

### Reload Plugin

Press **Ctrl+Shift+L** (or **Cmd+Shift+L** on Mac) to reload all plugins without restarting Studio.

### Check Output

Open **Output** window to see:
- Connection status
- Sync operations
- File changes being applied
- Errors and warnings

## Version

Plugin Version: 0.1.2 (Public Beta)

