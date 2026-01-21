# Version Checking System

RtVS includes an automatic version checking system to ensure the plugin and server stay synchronized with the latest releases.

## How It Works

### 1. Version Source of Truth

The `version.json` file in the GitHub repository root serves as the canonical source for version information:

```json
{
  "version": "0.1.2",
  "releaseDate": "2026-01-20",
  "changelog": {
    "0.1.2": [
      "Added version compatibility check",
      "Plugin functionality suspended on version mismatch"
    ]
  }
}
```

### 2. Server Version Checking

When the server starts, it:
1. Fetches `version.json` from GitHub
2. Compares the latest version with its current version
3. Displays an update notification if a newer version is available
4. Continues checking every hour for new updates

**Server Output Example:**
```
RtVS Server Started
Version: 0.1.2
Listening on http://localhost:8080
Storage path: D:\MyGame\synced-game

Checking for updates...
Server is up to date (v0.1.2)
```

**Update Available Example:**
```
========================================
SERVER UPDATE AVAILABLE
========================================
Current Version: 0.1.1
Latest Version:  0.1.2
Release Date:    2026-01-20

Changelog:
  - Added version compatibility check
  - Plugin functionality suspended on version mismatch

Update at: https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio
========================================
```

### 3. Plugin Version Checking

When the plugin connects to the server, it:
1. Receives the server's current version and latest known version
2. Checks if the plugin version matches the server version (required for operation)
3. Checks if a newer version is available on GitHub (informational)

**Plugin Output Examples:**

**Versions Match:**
```
RtVS Server connected (v0.1.2)
```

**Update Available (Non-blocking):**
```
RtVS Server connected (v0.1.2)
========================================
UPDATE AVAILABLE
========================================
A new version of RtVS is available!
Current Version: 0.1.2
Latest Version:  0.1.3

Download the latest version from GitHub:
https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio

Replace the plugin file in your Plugins folder:
  Windows: %LOCALAPPDATA%\Roblox\Plugins\
  macOS: ~/Documents/Roblox/Plugins/
========================================
```

**Plugin Outdated (Blocking):**
```
========================================
OUTDATED PLUGIN
========================================
Outdated Plugin!! Please reinstall from GitHub:
https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio

Download RtVS.rbxm and place it in your Plugins folder:
  Windows: %LOCALAPPDATA%\Roblox\Plugins\
  macOS: ~/Documents/Roblox/Plugins/

Plugin functionality has been suspended.
========================================
Plugin Version: 0.1.1
Server Version: 0.1.2
========================================
```

## Version Compatibility

### Required: Plugin and Server Must Match

The plugin and server **must** be on the same version to function. This ensures:
- API compatibility between plugin and server
- Consistent serialization/deserialization formats
- No breaking changes between components

If there's a version mismatch, the plugin will **suspend all functionality** until versions are synchronized.

### Optional: Update Notifications

If both the plugin and server are on the same version, but a newer version exists on GitHub:
- Both will display an **informational warning**
- All functionality continues to work normally
- Users are encouraged to update when convenient

## Updating Components

### Updating the Server

1. Pull the latest code from GitHub:
   ```bash
   git pull origin main
   ```

2. Reinstall dependencies (if package.json changed):
   ```bash
   npm install
   ```

3. Restart the server:
   ```bash
   npm start
   ```

### Updating the Plugin

1. Download the latest `RtVS.rbxm` from GitHub:
   - Go to https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio
   - Download the `RtVS.rbxm` file from the repository
2. Replace the old plugin file in your plugins folder:
   - Windows: `%LOCALAPPDATA%\Roblox\Plugins\`
   - macOS: `~/Documents/Roblox/Plugins/`
3. Restart Roblox Studio

## For Developers: Publishing Updates

When releasing a new version:

### 1. Update Version Numbers
```bash
# Update all version references
# - version.json (root)
# - server/package.json
# - server/src/api/health.ts (VERSION constant)
# - plugin/main.lua (PLUGIN_VERSION constant)
```

### 2. Update Changelog
Add release notes to `version.json`:
```json
{
  "version": "0.2.0",
  "releaseDate": "2026-01-25",
  "changelog": {
    "0.2.0": [
      "Added support for terrain serialization",
      "Improved performance for large games"
    ],
    "0.1.2": [
      "Previous changes..."
    ]
  }
}
```

### 3. Commit and Push
```bash
git add .
git commit -m "Release v0.2.0"
git push origin main
```

### 4. Build and Commit Plugin
1. Build the plugin: `npm run deploy` in `/server`
2. Commit the updated `RtVS.rbxm` to the repository:
   ```bash
   git add RtVS.rbxm
   git commit -m "Update plugin binary for v0.2.0"
   git push origin main
   ```

### 5. Users Will Auto-Detect Updates
- Existing servers will check for updates within 1 hour
- Existing plugins will see update notification on next connection
- Users can download the latest `RtVS.rbxm` directly from GitHub

## Architecture

### Server-Side Version Checking

**File**: `/server/src/utils/version-checker.ts`

**Functionality**:
- Fetches `version.json` from GitHub via HTTPS
- Caches latest version in memory
- Compares semantic versions (major.minor.patch)
- Checks every hour for updates
- Includes the latest version in `/ping` and `/status` responses

### Plugin-Side Version Checking

**File**: `/plugin/main.lua`

**Functionality**:
- Checks server version on connection
- Receives latest version from server
- Compares plugin version with server version (required)
- Compares plugin version with latest version (informational)
- Suspends functionality if version mismatch with server

## Benefits

1. **Automatic Update Notifications**: Users are informed when updates are available
2. **Compatibility Enforcement**: Plugin and server must match, preventing errors
3. **No Manual Checks**: Version checking happens automatically in the background
4. **Clear Error Messages**: Users know exactly what to do when versions don't match
5. **Single Source of Truth**: `version.json` on GitHub ensures consistency
