# Phase 3 Testing Guide - Bidirectional Sync

This guide walks you through testing the Phase 3 bidirectional synchronization feature.

## Prerequisites

1. Node.js server is running (`cd server && npm start`)
2. Roblox Studio is open with the plugin installed
3. You have a test place with some objects to sync

## Test 1: Initial Setup & Server Connection

### Steps:
1. Start the server: `cd server && npm start`
2. Open Roblox Studio
3. Check the Output window

### Expected Results:
```
RtVS Plugin loaded!
Testing server connection...
RtVS Server connected
Use 'Push to Files' to sync Studio → File System
Use 'Auto-Sync' to enable automatic Files → Studio sync
Started polling for file changes (every 2s)
```

### Success Criteria:
- Server connection successful
- Auto-sync starts automatically
- "Auto-Sync" button is highlighted

## Test 2: Studio → Files Sync (Push)

### Setup:
1. In Studio, add a few test objects:
   - A Part in Workspace (name it "TestPart")
   - A Script in ServerScriptService (name it "TestScript")
   - Set some properties (Color, Position, script source, etc.)

### Steps:
1. Click the **"Push to Files"** button
2. Check the Output window
3. Check the `/synced-game` directory

### Expected Results:

**Output Window:**
```
===== RtVS: Reading All Game Services =====
Read Workspace (5 objects)
Read ServerScriptService (2 objects)
...
Total objects processed: 15
Sending data to server...
Sync successful! Server wrote 12 files
```

**File System:**
```
/synced-game
  /Workspace
    /TestPart
      __main__.json
  /ServerScriptService
    TestScript.lua
  index.json
```

### Success Criteria:
- All objects exported correctly
- Script source code preserved
- Properties stored in JSON files
- File structure matches Studio hierarchy

## Test 3: Files → Studio Sync (Script Edit)

### Setup:
1. Ensure "Auto-Sync" is enabled (button highlighted)
2. Locate the script file created in Test 2: `/synced-game/ServerScriptService/TestScript.lua`

### Steps:
1. Open `TestScript.lua` in your code editor (VS Code, etc.)
2. Edit the script source:
   ```lua
   print("Hello from file system!")
   print("This was edited externally!")
   ```
3. Save the file
4. Wait 2-3 seconds
5. Check the Output window in Studio
6. Open TestScript in Studio and verify the source changed

### Expected Results:

**Output Window:**
```
Received 1 changes from server
Applying update for ServerScriptService/TestScript.lua
Updated script: ServerScriptService.TestScript
Applied all changes
```

**Studio:**
- TestScript.Source now contains "Hello from file system!"

### Success Criteria:
- File change detected by server within 2 seconds
- Plugin receives change notification
- Script source updates in Studio automatically
- No manual reload required

## Test 4: Files → Studio Sync (Property Edit)

### Setup:
1. Ensure "Auto-Sync" is enabled
2. Locate the part properties file: `/synced-game/Workspace/TestPart/__main__.json`

### Steps:
1. Open `__main__.json` in your code editor
2. Change the Color property:
   ```json
   {
     "ClassName": "Part",
     "Properties": {
       "Color": {
         "R": 1,
         "G": 0,
         "B": 0
       },
       "Size": {"X": 10, "Y": 5, "Z": 10}
     }
   }
   ```
3. Save the file
4. Wait 2-3 seconds
5. Check Studio - TestPart should now be red

### Expected Results:

**Output Window:**
```
Received 1 changes from server
Applying update for Workspace/TestPart/__main__.json
Updated properties: Workspace.TestPart
Applied all changes
```

**Studio:**
- TestPart is now red (RGB 1,0,0)
- TestPart size is 10x5x10

### Success Criteria:
- Property changes detected
- Properties applied to existing instance
- Visual changes immediately visible

## Test 5: Create New Object from Files

### Setup:
1. Ensure "Auto-Sync" is enabled
2. Create new files manually

### Steps:
1. Create a new folder: `/synced-game/ReplicatedStorage/Utils`
2. Create a new file: `/synced-game/ReplicatedStorage/Utils/Helper.lua`
3. Add content:
   ```lua
   local Helper = {}

   function Helper.sayHello()
       print("Hello from Helper!")
   end

   return Helper
   ```
4. Save the file
5. Wait 2-3 seconds
6. Check ReplicatedStorage in Studio

### Expected Results:

**Output Window:**
```
Received 2 changes from server
Applying create for ReplicatedStorage/Utils/Helper.lua
Created ModuleScript at ReplicatedStorage.Utils.Helper
Updated script: ReplicatedStorage.Utils.Helper
Applied all changes
```

**Studio:**
- New folder "Utils" created in ReplicatedStorage
- New ModuleScript "Helper" created inside Utils
- Helper.Source contains the code

### Success Criteria:
- New folders created automatically
- New ModuleScript created with correct source
- Instance hierarchy matches file structure

## Test 6: Delete Object via Files

### Setup:
1. Ensure "Auto-Sync" is enabled
2. Have an object synced (e.g., TestPart from earlier tests)

### Steps:
1. Delete the file: `/synced-game/Workspace/TestPart/__main__.json`
2. Wait 2-3 seconds
3. Check Workspace in Studio

### Expected Results:

**Output Window:**
```
Received 1 changes from server
Applying delete for Workspace/TestPart/__main__.json
Deleting Workspace.TestPart
Applied all changes
```

**Studio:**
- TestPart is removed from Workspace

### Success Criteria:
- File deletion detected
- Corresponding instance deleted in Studio
- No errors in Output

## Test 7: Conflict Resolution (Server Files Win)

This test verifies that server files take priority over Studio changes.

### Setup:
1. Ensure "Auto-Sync" is enabled
2. Have a synced script (e.g., TestScript)

### Steps:
1. In Studio, edit TestScript.Source to: `print("Studio edit")`
2. Immediately (within 2 seconds), edit the file externally to: `print("File edit")`
3. Save the file
4. Wait 2-3 seconds
5. Check TestScript.Source in Studio

### Expected Results:

**Studio:**
- TestScript.Source contains: `print("File edit")`
- Studio changes were overwritten

### Success Criteria:
- File system version takes priority
- Studio changes are overwritten
- No conflicts or errors

## Test 8: Toggle Auto-Sync On/Off

### Steps:
1. Click "Auto-Sync" button (should be highlighted)
2. Button becomes un-highlighted
3. Check Output window: `Stopped polling for file changes`
4. Edit a file externally
5. Wait 5 seconds
6. Verify Studio does NOT update
7. Click "Auto-Sync" again
8. Wait 2-3 seconds
9. Verify Studio now receives pending changes

### Expected Results:

**When disabled:**
- File changes do NOT sync to Studio
- No polling happens

**When re-enabled:**
- All pending changes are applied immediately
- Polling resumes

### Success Criteria:
- Toggle works correctly
- Changes accumulate while disabled
- Changes apply when re-enabled

## Test 9: Multiple Simultaneous Changes

### Steps:
1. Ensure "Auto-Sync" is enabled
2. Edit 5 different files at once:
   - 3 script files
   - 2 property files
3. Save all files quickly
4. Wait 2-3 seconds
5. Check Studio

### Expected Results:

**Output Window:**
```
Received 5 changes from server
Applying update for ...
Applying update for ...
...
Applied all changes
```

**Studio:**
- All 5 changes applied correctly

### Success Criteria:
- All changes detected
- All changes applied successfully
- No race conditions or errors

## Test 10: Server Restart Recovery

### Steps:
1. Ensure "Auto-Sync" is enabled
2. Stop the server (Ctrl+C)
3. Edit a file externally
4. Wait 5 seconds
5. Start the server again: `npm start`
6. Wait 5 seconds
7. Check Studio

### Expected Results:

**Output Window (during server down):**
- Polling continues silently (no errors shown)

**Output Window (after server restart):**
```
Received 1 changes from server
Applied all changes
```

**Studio:**
- Changes applied once server reconnects

### Success Criteria:
- Plugin handles server disconnections gracefully
- Changes sync once server restarts
- No crashes or stuck states

## Common Issues & Solutions

### Changes not syncing to Studio

**Problem:** File edits don't appear in Studio

**Solutions:**
1. Check "Auto-Sync" button is highlighted (enabled)
2. Check server is running: `npm start`
3. Check Output window for errors
4. Verify file paths match Studio object names exactly
5. Try toggling "Auto-Sync" off and on

### Script not updating

**Problem:** Script source doesn't change in Studio

**Solutions:**
1. Ensure you're editing the correct `.lua` file
2. Check script exists in Studio (create it first via "Push to Files")
3. Verify the script is a Script/LocalScript/ModuleScript
4. Check Output for deserialization errors

### Objects created in wrong location

**Problem:** New instances appear in unexpected places

**Solutions:**
1. Check file path structure matches Studio hierarchy
2. Service names must be exact (Workspace, ServerScriptService, etc.)
3. Use "Push to Files" first to see correct structure
4. Verify folder names match object names exactly

### Properties not applying

**Problem:** JSON property changes don't affect Studio objects

**Solutions:**
1. Verify JSON syntax is valid
2. Check property names are correct (case-sensitive)
3. Some properties are read-only (like ClassName)
4. Complex datatypes need correct structure (Vector3, Color3, etc.)

## Performance Notes

- Polling interval: 2 seconds (configurable in `main.lua`)
- File watcher stability threshold: 100ms
- Minimal performance impact on Studio
- Server handles large games efficiently

## Next Steps

Once all tests pass:
1. Test with a real game project
2. Experiment with different file structures
3. Try Git operations (commit, branch, merge)
4. Test collaborative workflows

## Reporting Issues

If you encounter bugs during testing:
1. Check the server console for errors
2. Check Studio Output window for errors
3. Note the exact steps to reproduce
4. Check file paths and names
5. Verify server and plugin versions match
