/**
 * RBXMX (Roblox XML Model) writer
 * Creates XML-format plugin files that Roblox Studio can load
 */

interface RbxmxInstance {
  ClassName: 'Script' | 'ModuleScript' | 'Folder';
  Name: string;
  Source?: string;
  Children: RbxmxInstance[];
}

/**
 * Generates a unique referent ID for an instance
 */
function generateReferent(): string {
  const chars = '0123456789ABCDEF';
  let result = 'RBX';
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/**
 * Escapes special XML characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Writes a single instance to XML
 */
function writeInstance(instance: RbxmxInstance, indent: string = '\t'): string {
  const referent = generateReferent();
  let xml = `${indent}<Item class="${instance.ClassName}" referent="${referent}">\n`;

  // Properties section
  xml += `${indent}\t<Properties>\n`;
  xml += `${indent}\t\t<BinaryString name="AttributesSerialize"></BinaryString>\n`;
  xml += `${indent}\t\t<SecurityCapabilities name="Capabilities">0</SecurityCapabilities>\n`;
  xml += `${indent}\t\t<bool name="DefinesCapabilities">false</bool>\n`;
  xml += `${indent}\t\t<string name="Name">${escapeXml(instance.Name)}</string>\n`;

  // Add Source property for scripts
  if (instance.Source !== undefined) {
    xml += `${indent}\t\t<ProtectedString name="Source"><![CDATA[${instance.Source}]]></ProtectedString>\n`;
  }

  xml += `${indent}\t\t<int64 name="SourceAssetId">-1</int64>\n`;
  xml += `${indent}\t\t<BinaryString name="Tags"></BinaryString>\n`;
  xml += `${indent}\t</Properties>\n`;

  // Children
  for (const child of instance.Children) {
    xml += writeInstance(child, indent + '\t');
  }

  xml += `${indent}</Item>\n`;
  return xml;
}

/**
 * Writes an RBXMX file containing Script and ModuleScript instances
 */
export function writeRbxmx(roots: RbxmxInstance[]): string {
  let xml = '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n';
  xml += '\t<External>null</External>\n';
  xml += '\t<External>nil</External>\n';

  for (const root of roots) {
    xml += writeInstance(root);
  }

  xml += '</roblox>';
  return xml;
}
