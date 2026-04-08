import fs from 'fs/promises';
import path from 'path';
import { writeRbxmx } from './rbxmx-writer';

interface PluginInstance {
  ClassName: 'Script' | 'ModuleScript' | 'Folder';
  Name: string;
  Source?: string;
  Children: PluginInstance[];
}

export async function buildPlugin(): Promise<string> {
  const pluginDir = path.join(__dirname, '../../../plugin');

  console.log('Building RtVS plugin...');
  console.log(`Reading Lua files from: ${pluginDir}`);

  let mainSource: string;
  let deserializerSource: string;
  let studioWatcherSource: string;
  let pathUtilsSource: string;

  try {
    mainSource = await fs.readFile(path.join(pluginDir, 'main.lua'), 'utf-8');
    deserializerSource = await fs.readFile(path.join(pluginDir, 'deserializer.lua'), 'utf-8');
    studioWatcherSource = await fs.readFile(path.join(pluginDir, 'studio-watcher.lua'), 'utf-8');
    pathUtilsSource = await fs.readFile(path.join(pluginDir, 'path-utils.lua'), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read plugin source files: ${error instanceof Error ? error.message : String(error)}`);
  }

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
      },
      {
        ClassName: 'ModuleScript',
        Name: 'path-utils',
        Source: pathUtilsSource,
        Children: []
      }
    ]
  };

  const rbxmxContent = writeRbxmx([root]);
  console.log(`Plugin built successfully: ${rbxmxContent.length} bytes`);

  return rbxmxContent;
}
