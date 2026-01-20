# RtVS - Roblox to Visual Studio

![RtVS Logo](https://cdn.catman6112.dev/Images/RtVS.png)

Contrary to popular belief, this does work with other code editors besides VS..

**Version: 0.1.1 (Public Beta)**

---

A 2-way synchronization system that connects Roblox Studio to your file system (and vice versa), enabling version control and external editing of Roblox game content.

**What's Working:**
- **Bidirectional sync** - Changes flow both ways (Studio <-> Files)
- **Live reload** - Edit `.lua` files, see changes instantly in Studio or your FAVORITE code editor
- **File watching** - Server monitors files for changes with chokidar
- **Priority modes** - Studio or Server can be the single source of truth
- **Create/update/delete** - All file operations supported
- **Automatic instance creation** - New files create new objects
- **Property updates** - Edit JSON files to change object properties
- **Tagretable Script Types** You're able to name files .module.lua and .local/client.lua to make them client or module scripts. .lua is a normal server script.

**What I'm Still Working On:** (bugs)
- **Duplication** - It's possible for scripts to duplicate while syncing if the target has been renamed / moved on the recieving end of a sync.
Just dont mess with files you're currently editing on the other end.

## Project Structure

```
/RtVS
  /server                  Node.js/TypeScript server
    /src
      /types               TypeScript type definitions
      /api                 HTTP endpoint handlers
      /file-system         File I/O operations
      /serializers         Roblox datatype converters
      server.ts            Main entry point
    package.json
    tsconfig.json

  /plugin                  Roblox Studio plugin (Lua)
    main.lua               Plugin entry point with bidirectional sync
    deserializer.lua       Applies file changes to Studio
    workspace-reader.lua   Legacy (Phase 1-2, kept for reference)
    README.md              Plugin installation and usage guide

  /synced-game             Output directory (created on first sync)
    /Workspace
    /ServerScriptService
    /ReplicatedStorage
    index.json

  QUICKSTART.md            Getting started guide
  TESTING.md               Comprehensive testing guide
  README.md                This file
```

## Output File Structure

The server creates files following this structure:

### For Scripts (Script, LocalScript, ModuleScript):

**Script with no children:**
```
/ServerScriptService
  MainScript.lua           Contains script source code
```

**Script with children:**
```
/ServerScriptService
  /GameManager
    __main__.lua           Script source code
    __main__.json          Script properties (Name, ClassName, etc.)
    /ConfigModule.lua      Child scripts
```

### For Non-Script Objects:

```
/Workspace
  /Part1
    __main__.json          Properties: Size, Position, Color, etc.
    /Attachment1
      __main__.json        Nested object properties
```

### Root Index File:

```json
{
  "version": "0.1.1",
  "timestamp": "2024-01-18T12:34:56.789Z",
  "services": [
    {
      "name": "Workspace",
      "className": "Workspace",
      "path": "/Workspace",
      "children": [...]
    }
  ],
  "totalObjects": 42
}
```

## API Endpoints

The server exposes the following endpoints:

`GET /ping`
--
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.1"
}
```

### `GET /status`
Server status with sync information.

**Response:**
```json
{
  "connected": true,
  "lastSync": "2024-01-18T12:34:56.789Z",
  "filesCount": 42,
  "version": "0.1.1"
}
```

### `POST /sync`
Receive game data from plugin and write to file system.

**Request Body:** JSON game data (from plugin)

**Response:**
```json
{
  "success": true,
  "filesWritten": 42,
  "timestamp": "2024-01-18T12:34:56.789Z"
}
```

### `GET /changes`
Poll for file system changes. Returns pending changes with file content.

**Response:**
```json
{
  "changes": [
    {
      "type": "update",
      "path": "ServerScriptService/TestScript.lua",
      "timestamp": "2024-01-18T12:34:56.789Z",
      "content": "print('Hello World!')"
    }
  ]
}
```

## Server Configuration

The server can be configured via environment variables:

```bash
PORT=8080  # Server port (default: 8080)
```

**Important:** The server MUST run on `localhost` (not `127.0.0.1`) for Roblox Studio to connect.

## Plugin Configuration
(this is incompatible with Option A for plugin install, as you dont have access to source.)

Edit the `SERVER_URL` constant in `workspace-reader.lua` to change the server address:

```lua
local SERVER_URL = "http://localhost:8080"
```

## Troubleshooting

### Plugin shows "Server not running" warning

1. Make sure the server is running: `cd server && npm start`
2. Check the server is on port 8080: look for `Listening on http://localhost:8080`
3. Verify the plugin's `SERVER_URL` matches the server address

### "Trust check failed" error

This error occurs when using `127.0.0.1` instead of `localhost`. The plugin must use `http://localhost:8080`.

### No files created in `/synced-game`

1. Check the server Output for errors
2. Verify the plugin successfully sent data (look for "Sync successful" in Studio Output)
3. Check file permissions in the RtVS project directory

### TypeScript compilation errors

Run `npm run build` in the `/server` directory to check for errors:

```bash
cd server
npm run build
```

## Development

### Server Development

```bash
cd server

# Install dependencies
npm install

# Start development server (auto-reloads on changes)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Type check without building
npm run watch
```

### Plugin Development

1. Edit `/plugin/workspace-reader.lua` in your code editor
2. In Roblox Studio, press **Ctrl+Shift+L** (⌘+Shift+L on Mac) to reload the plugin
3. Test your changes by clicking the "Read Game" button

### Debugging

**Server:**
- Check console output for request logs
- All HTTP requests are logged: `GET /ping`, `POST /sync`, etc.
- Errors are logged with stack traces

**Plugin:**
- Use `print()` statements (appear in Studio Output window)
- Use `warn()` for errors (appear in yellow/red in Output)
- Check `Workspace.RtVS_Output.Value` for the raw JSON if sync fails

## Technical Details

### Supported Roblox Data Types

The plugin serializes the following Roblox datatypes:

- **Vector3** → `{X: number, Y: number, Z: number}`
- **Vector2** → `{X: number, Y: number}`
- **Color3** → `{R: number, G: number, B: number}`
- **CFrame** → `{Position: Vector3, Components: number[]}`
- **BrickColor** → string name
- **Enums** → string representation (e.g., "Enum.Material.Plastic")
- **Instance references** → full path (e.g., "workspace.Part1")

### Game Services

The plugin reads these 13 game services:

1. Workspace
2. ReplicatedStorage
3. ReplicatedFirst
4. ServerScriptService
5. ServerStorage
6. StarterGui
7. StarterPack
8. StarterPlayer
9. Lighting
10. SoundService
11. Chat
12. LocalizationService
13. TestService

## Example Workflow: Edit in VS Code

1. Enable **"Prioritize Server"** in Roblox Studio after the initial sync
2. Open `/synced-game-directory/ServerScriptService/MainScript.lua` in VS Code
3. Edit the script:
   ```lua
   print("Hello from VS Code!")
   ```
4. Save the file (Ctrl+S)
5. Go back to Studio - the script source has automatically updated!


## Documentation

- **`QUICKSTART.md`** - Get started in 5 minutes
- **`TESTING.md`** - Comprehensive testing guide with 10 scenarios
- **`plugin/README.md`** - Plugin installation and usage

## Contributing

This project is in active development. 

## License (see:`LICENSE.md`)

Polyform Noncommercial License

---

**Need help?** Check `QUICKSTART.md` to get started, or re-read the troubleshooting segment.

### Use of AI
As much as I despise AI and how it's destroying creative work, I think there's use in it for inteligent reptitve tasks such as writing documentation.

This document has been **heavily** edited and proof-read by myself to ensure it: 

#### A. Reflects me and how I want the project to appear
and 

#### B. Ensures it actually does it's job as documentation and is correct and reliable.

Every document in this project meets those criteria, and thus AI can be used to helpfully assist and not replace in this project.

If you'd like to re-write it yourself or make changes, feel free to open a PR.
