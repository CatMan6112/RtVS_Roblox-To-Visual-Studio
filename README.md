# RtVS - Roblox to Visual Studio

![RtVS Logo](https://cdn.catman6112.dev/Images/RtVS.png)

Contrary to popular belief, this works with any code editor.

**Version: 0.1.2 (Public Beta)**

A bidirectional synchronization system that connects Roblox Studio to your file system, enabling version control and external editing of Roblox game content.

## Features

- Bidirectional sync between Roblox Studio and file system
- Edit scripts in external editors (VS Code, Sublime, etc.)
- Real-time file watching and automatic updates
- Priority modes to control sync direction
- Complete Roblox datatype serialization
- Git-friendly file structure
- Version compatibility checking

## Quick Start

See QUICKSTART.md for installation and setup instructions.

## Known Issues

- Script duplication can occur if files are renamed or moved during active sync. Avoid modifying the same files on both ends simultaneously.

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
- `/synced-game` directory (Or can be reconfigured) containing the synchronized file structure
- Scripts as `.lua`, `.local.lua`/`.client.lua`, or `.module.lua`. All script types supported.
- Properties as `__main__.json` files
- Complete hierarchy in `index.json`

## How It Works

1. Install the plugin using `npm run deploy` from the server directory
2. Start the server with `npm start`
3. Use priority modes to control sync direction:
   - **Prioritize Studio**: Studio changes sync to files automatically
   - **Prioritize Server**: File changes sync to Studio automatically
   - **Full Sync**: One-time complete overwrite from Studio to files

See `plugin/README.md` for detailed usage information and workflows.

## Project Files

- `QUICKSTART.md` - Installation and setup guide
- `plugin/README.md` - Plugin usage, workflows, and file format documentation
- `CLAUDE.md` - Development documentation and implementation notes
- `server/` - Node.js/TypeScript server source code
- `plugin/` - Roblox Studio plugin Lua source code

## Requirements

- Node.js 18+
- Roblox Studio
- Windows or macOS

## License

Attribution-NonCommercial-NoDerivatives 4.0 International (see LICENSE.md)

## Contributing

This project is in active development. Pull requests are welcome.

## Support

For installation and setup help, see QUICKSTART.md.

For plugin usage and workflows, see plugin/README.md.

For technical development details, see CLAUDE.md.
