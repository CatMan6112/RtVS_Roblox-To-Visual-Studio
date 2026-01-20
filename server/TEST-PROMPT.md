# Testing the Storage Path Prompt

## How to Test

1. Start the server:
   ```bash
   cd server
   npm start
   ```

2. You'll see a prompt like this:
   ```
   📁 Configure Storage Path
   ──────────────────────────────────────────────────
   Where would you like to store synced game files?
   (Press Enter for default: ../synced-game)

   Storage path:
   ```

3. Enter a path or press Enter for the default:
   - **Absolute path**: `C:\MyGames\RobloxSync`
   - **Relative path**: `../my-game-files`
   - **Default**: Press Enter to use `../synced-game`

4. The server will confirm the path:
   ```
   ✓ Storage path set to: C:\MyGames\RobloxSync

   ──────────────────────────────────────────────────

   🚀 RtVS Server Started
   📡 Listening on http://localhost:8080
   📁 Storage path: C:\MyGames\RobloxSync
   ```

## What Changed

- Added `readline-sync` package for terminal input
- Created `/server/src/config/path-config.ts` module
- Updated `server.ts`, `api/sync.ts`, and `api/studio-change.ts` to use the configured path
- Server now prompts for path before starting instead of using hardcoded `../synced-game`

## Examples

### Example 1: Custom absolute path
```
Storage path: D:\Projects\MyRobloxGame\synced-files
✓ Storage path set to: D:\Projects\MyRobloxGame\synced-files
```

### Example 2: Relative path
```
Storage path: ./game-files
✓ Storage path set to: D:\RtVS\server\game-files
```

### Example 3: Default path (press Enter)
```
Storage path:
✓ Storage path set to: D:\RtVS\synced-game
```
