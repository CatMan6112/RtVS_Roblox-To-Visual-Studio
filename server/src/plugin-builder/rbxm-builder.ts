/**
 * RtVS Plugin Builder
 * Reads Lua source files and builds them into an RBXMX plugin file
 */

import fs from 'fs/promises';
import path from 'path';
import { writeRbxmx } from './rbxmx-writer';

interface PluginInstance {
  ClassName: 'Script' | 'ModuleScript' | 'Folder';
  Name: string;
  Source?: string;
  Children: PluginInstance[];
}

/**
 * Builds the RtVS plugin from source files
 * @returns String containing the .rbxmx file data
 */
export async function buildPlugin(): Promise<string> {
  // Locate plugin directory (relative to this file: server/src/plugin-builder)
  const pluginDir = path.join(__dirname, '../../../plugin');

  console.log('Building RtVS plugin...');
  console.log(`Reading Lua files from: ${pluginDir}`);

  // Read all Lua source files
  let mainSource: string;
  let deserializerSource: string;
  let studioWatcherSource: string;

  try {
    mainSource = await fs.readFile(path.join(pluginDir, 'main.lua'), 'utf-8');
    deserializerSource = await fs.readFile(path.join(pluginDir, 'deserializer.lua'), 'utf-8');
    studioWatcherSource = await fs.readFile(path.join(pluginDir, 'studio-watcher.lua'), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read plugin source files: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`  main.lua: ${mainSource.length} bytes`);
  console.log(`  deserializer.lua: ${deserializerSource.length} bytes`);
  console.log(`  studio-watcher.lua: ${studioWatcherSource.length} bytes`);

  // Build instance tree
  // The structure must match the require() calls in main.lua:
  // - require(script.Parent.deserializer)
  // - require(script.Parent["studio-watcher"])
  // Wrap everything in a Folder container (required for Roblox plugins)
  const root: PluginInstance = {
    ClassName: 'Folder',
    Name: 'RtVS-Plugin',
    Children: [
      {
        ClassName: 'Script',
        Name: 'main',
        Source: mainSource,
        Children: []
      },
      {
        ClassName: 'ModuleScript',
        Name: 'deserializer',
        Source: deserializerSource,
        Children: []
      },
      {
        ClassName: 'ModuleScript',
        Name: 'studio-watcher',
        Source: studioWatcherSource,
        Children: []
      }
    ]
  };

  console.log('Generating .rbxmx XML...');

  // Serialize to .rbxmx format
  const rbxmxContent = writeRbxmx([root]);

  console.log(`Plugin built successfully: ${rbxmxContent.length} bytes`);

  return rbxmxContent;
}
