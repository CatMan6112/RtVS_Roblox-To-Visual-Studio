/**
 * Serializes Roblox instance properties to JSON format for __main__.json files
 */

import { RobloxInstance } from "../types/roblox";

/**
 * Extract properties to write to __main__.json
 * Excludes Source property (handled separately for scripts)
 */
export function serializeProperties(instance: RobloxInstance): object {
  const { Properties, Attributes, ClassName, Name } = instance;

  const output: any = {
    ClassName,
    Name,
  };

  // Add properties (excluding Source which goes in .lua files)
  if (Properties && Object.keys(Properties).length > 0) {
    const filteredProps = { ...Properties };
    delete filteredProps.Source; // Source goes in .lua file, not JSON

    if (Object.keys(filteredProps).length > 0) {
      output.Properties = filteredProps;
    }
  }

  // Add attributes if they exist
  if (Attributes && Object.keys(Attributes).length > 0) {
    output.Attributes = Attributes;
  }

  return output;
}

/**
 * Create a pretty-printed JSON string for file writing
 */
export function toJsonString(obj: object): string {
  return JSON.stringify(obj, null, 2);
}
