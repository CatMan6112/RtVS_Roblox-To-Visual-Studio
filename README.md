# RtVS - Roblox to Visual Studio

![RtVS Logo](https://cdn.catman6112.dev/Images/RtVS.png)

Works with any code editor.

**Version: 0.1.4**

A bidirectional synchronization system that connects Roblox Studio to your file system, enabling version control and external editing of Roblox game content.

## Installation

The easiest way to install RtVS. Handles Node.js setup, plugin deployment, and optional desktop shortcuts automatically.

**Linux / macOS** - open a Terminal and run:
```bash
sh -c "$(curl -sS https://raw.githubusercontent.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/main/install.sh)"
```

**Windows** - open PowerShell and run:
```powershell
irm https://raw.githubusercontent.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/main/install.ps1 | iex
```

> On Windows, press `Win + R`, type `powershell`, and hit Enter to open PowerShell.

The installer checks for Node.js 18+, downloads RtVS, installs dependencies, deploys the plugin, and optionally creates shortcuts.

See [QUICKSTART.md](QUICKSTART.md) for manual installation.

## Features

- Bidirectional sync between Roblox Studio and file system
- Edit scripts in external editors
- Real-time file watching and automatic updates
- Priority modes to control sync direction
- Complete Roblox datatype serialization
- Git-friendly file structure
- Version compatibility checking

## Quick Start

See QUICKSTART.md for installation and setup instructions.

## Known Issues

- Script duplication can occur if files are renamed or moved during active sync.

## Architecture

The system consists of two main components:

**Server (Node.js/TypeScript):**
- HTTP server running on localhost:8080
- File system watcher using chokidar
- Serialization/deserialization of Roblox datatypes
- REST API for plugin communication

**Plugin (Roblox Studio):**
- Toolbar UI with sync controls
- Instance tree serialization
- Bidirectional sync with priority modes
- Automatic version compatibility checking

**Output:**
- `/synced-game` directory containing the synchronized file structure
- Scripts as `.lua`, `.local.lua`/`.client.lua`, or `.module.lua`
- Properties as `__main__.json` files
- Complete hierarchy in `index.json`

## How It Works

1. Install RtVS using the installer
2. Start the server with `npm start`
3. Use priority modes:
   - Prioritize Studio: Studio changes sync to files
   - Prioritize Server: File changes sync to Studio
   - Full Sync: Complete overwrite from Studio

See `plugin/README.md` for detailed usage.

## Project Files

- `QUICKSTART.md` - Installation and setup guide
- `plugin/README.md` - Plugin usage, workflows, and file format documentation
- `server/` - Node.js/TypeScript server source code
- `plugin/` - Roblox Studio plugin Lua source code

## Requirements

- Node.js 18+
- Roblox Studio
- Windows, macOS, or Linux

## License

Attribution-NonCommercial-NoDerivatives 4.0 International (see LICENSE.md)

## Contributing

This project is in active development. Pull requests are welcome.


