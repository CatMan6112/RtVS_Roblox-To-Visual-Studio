/**
 * RtVS Plugin Deployment Script
 * Builds the plugin and installs it to the Roblox plugins folder
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { buildPlugin } from './rbxm-builder';

/**
 * Gets the Roblox plugins folder path for the current OS
 */
function getRobloxPluginsPath(): string {
  const platform = os.platform();

  switch (platform) {
    case 'win32':
      // Windows: %LOCALAPPDATA%\Roblox\Plugins
      const localAppData = process.env.LOCALAPPDATA;
      if (!localAppData) {
        throw new Error('LOCALAPPDATA environment variable not found');
      }
      return path.join(localAppData, 'Roblox', 'Plugins');

    case 'darwin':
      // macOS: ~/Documents/Roblox/Plugins
      const homeDir = process.env.HOME || os.homedir();
      return path.join(homeDir, 'Documents', 'Roblox', 'Plugins');

    case 'linux':
      throw new Error('Roblox Studio is not available on Linux');

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Ensures a directory exists, creating it if necessary
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    console.log(`Creating directory: ${dirPath}`);
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Main deployment function
 */
async function deploy(): Promise<void> {
  console.log('========================================');
  console.log('RtVS Plugin Deployment');
  console.log('========================================\n');

  try {
    // Build the plugin
    const pluginContent = await buildPlugin();

    console.log('');

    // Get Roblox plugins path
    const pluginsPath = getRobloxPluginsPath();
    console.log(`Target: ${pluginsPath}`);

    // Ensure plugins directory exists
    await ensureDirectory(pluginsPath);

    // Write plugin file
    const pluginFilePath = path.join(pluginsPath, 'RtVS-Plugin.rbxmx');
    await fs.writeFile(pluginFilePath, pluginContent, 'utf-8');

    console.log(`\nPlugin installed successfully!`);
    console.log(`Location: ${pluginFilePath}`);
    console.log('');
    console.log('========================================');

  } catch (error) {
    console.error('\n========================================');
    console.error('DEPLOYMENT FAILED');
    console.error('========================================');

    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);

      // Provide helpful error messages
      if (error.message.includes('Failed to read plugin source files')) {
        console.error('\nMake sure you are running this command from the /server directory');
        console.error('and that the /plugin directory contains the Lua source files.');
      } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
        console.error('\nPermission denied. Try running the command as administrator.');
      } else if (error.message.includes('LOCALAPPDATA')) {
        console.error('\nCould not locate the Roblox plugins folder.');
        console.error('Make sure Roblox Studio is installed.');
      }
    } else {
      console.error(`Error: ${String(error)}`);
    }

    console.error('========================================\n');
    process.exit(1);
  }
}

// Run deployment
deploy();
