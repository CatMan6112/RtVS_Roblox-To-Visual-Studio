/**
 * Minimal RBXM (Roblox Binary Model) writer
 * Based on the Roblox binary format specification
 * Supports only Script and ModuleScript instances with Name and Source properties
 * Uses uncompressed format for simplicity
 */

interface RbxmInstance {
  ClassName: 'Script' | 'ModuleScript';
  Name: string;
  Source: string;
  Children: RbxmInstance[];
}

interface InstanceData {
  instance: RbxmInstance;
  referent: number;
  parentReferent: number;
}

/**
 * Writes an RBXM file containing Script and ModuleScript instances
 */
export function writeRbxm(roots: RbxmInstance[]): Buffer {
  // Flatten instance tree and assign referents
  const instances: InstanceData[] = [];
  let referentCounter = 0;

  function flattenTree(inst: RbxmInstance, parentRef: number) {
    const myRef = referentCounter++;
    instances.push({
      instance: inst,
      referent: myRef,
      parentReferent: parentRef
    });

    for (const child of inst.Children) {
      flattenTree(child, myRef);
    }
  }

  // Root instances have parentReferent = -1
  for (const root of roots) {
    flattenTree(root, -1);
  }

  // Group instances by class
  const scriptInstances = instances.filter(i => i.instance.ClassName === 'Script');
  const moduleScriptInstances = instances.filter(i => i.instance.ClassName === 'ModuleScript');

  // Build chunks
  const chunks: Buffer[] = [];

  // META chunk (metadata)
  chunks.push(createMetaChunk());

  // SSTR chunk (shared strings - empty for now)
  chunks.push(createSstrChunk());

  // INST chunks (instance definitions by class)
  if (scriptInstances.length > 0) {
    chunks.push(createInstChunk('Script', scriptInstances.map(i => i.referent)));
  }
  if (moduleScriptInstances.length > 0) {
    chunks.push(createInstChunk('ModuleScript', moduleScriptInstances.map(i => i.referent)));
  }

  // PROP chunks (properties by class)
  if (scriptInstances.length > 0) {
    chunks.push(createPropChunk('Script', 'Name', scriptInstances.map(i => i.instance.Name)));
    chunks.push(createPropChunk('Script', 'Source', scriptInstances.map(i => i.instance.Source)));
  }
  if (moduleScriptInstances.length > 0) {
    chunks.push(createPropChunk('ModuleScript', 'Name', moduleScriptInstances.map(i => i.instance.Name)));
    chunks.push(createPropChunk('ModuleScript', 'Source', moduleScriptInstances.map(i => i.instance.Source)));
  }

  // PRNT chunk (parent-child relationships)
  chunks.push(createPrntChunk(instances));

  // END chunk
  chunks.push(createEndChunk());

  // Create header
  const header = createHeader(
    scriptInstances.length + moduleScriptInstances.length,
    (scriptInstances.length > 0 ? 1 : 0) + (moduleScriptInstances.length > 0 ? 1 : 0)
  );

  // Combine all parts
  return Buffer.concat([header, ...chunks]);
}

/**
 * Creates the 32-byte RBXM header
 */
function createHeader(instanceCount: number, classCount: number): Buffer {
  const header = Buffer.alloc(32);
  let offset = 0;

  // Magic: "<roblox!"
  header.write('<roblox!', offset, 'binary');
  offset += 8;

  // Signature bytes
  header.writeUInt8(0x89, offset++);
  header.writeUInt8(0xff, offset++);
  header.writeUInt8(0x0d, offset++);
  header.writeUInt8(0x0a, offset++);
  header.writeUInt8(0x1a, offset++);
  header.writeUInt8(0x0a, offset++);

  // Version (always 0)
  header.writeUInt16LE(0, offset);
  offset += 2;

  // Class count
  header.writeUInt32LE(classCount, offset);
  offset += 4;

  // Instance count
  header.writeUInt32LE(instanceCount, offset);
  offset += 4;

  // Reserved (8 bytes of zeros)
  // Already zeroed by Buffer.alloc

  return header;
}

/**
 * Creates a chunk with header and data
 */
function createChunk(name: string, data: Buffer): Buffer {
  const header = Buffer.alloc(16);
  let offset = 0;

  // Chunk name (4 bytes)
  header.write(name.padEnd(4, ' ').substring(0, 4), offset, 'binary');
  offset += 4;

  // Compressed length (0 = uncompressed)
  header.writeUInt32LE(0, offset);
  offset += 4;

  // Uncompressed length
  header.writeUInt32LE(data.length, offset);
  offset += 4;

  // Reserved (4 bytes of zeros)
  offset += 4;

  return Buffer.concat([header, data]);
}

/**
 * Creates META chunk with file metadata
 */
function createMetaChunk(): Buffer {
  const entries = new Map<string, string>([
    ['ExplicitAutoJoints', 'true']
  ]);

  const data = Buffer.alloc(4);
  data.writeUInt32LE(entries.size, 0);

  const parts: Buffer[] = [data];

  for (const [key, value] of entries) {
    parts.push(writeString(key));
    parts.push(writeString(value));
  }

  return createChunk('META', Buffer.concat(parts));
}

/**
 * Creates empty SSTR chunk (shared strings)
 */
function createSstrChunk(): Buffer {
  const data = Buffer.alloc(8);
  data.writeUInt32LE(0, 0); // Version
  data.writeUInt32LE(0, 4); // Count
  return createChunk('SSTR', data);
}

/**
 * Creates INST chunk for a class
 */
function createInstChunk(className: string, referents: number[]): Buffer {
  const parts: Buffer[] = [];

  // Class ID (always 0 for simplicity)
  parts.push(writeUInt32(0));

  // Class name
  parts.push(writeString(className));

  // Additional data flag (0 = none)
  parts.push(Buffer.from([0]));

  // Instance count
  parts.push(writeUInt32(referents.length));

  // Referents (transformed integers)
  parts.push(writeIntArray(referents));

  // Service markers (all false)
  const markers = Buffer.alloc(referents.length);
  parts.push(markers);

  return createChunk('INST', Buffer.concat(parts));
}

/**
 * Creates PROP chunk for a property
 */
function createPropChunk(_className: string, propName: string, values: string[]): Buffer {
  const parts: Buffer[] = [];

  // Class ID (always 0)
  parts.push(writeUInt32(0));

  // Property name
  parts.push(writeString(propName));

  // Type ID (0x01 = String)
  parts.push(Buffer.from([0x01]));

  // Values
  for (const value of values) {
    parts.push(writeString(value));
  }

  return createChunk('PROP', Buffer.concat(parts));
}

/**
 * Creates PRNT chunk with parent-child relationships
 */
function createPrntChunk(instances: InstanceData[]): Buffer {
  const parts: Buffer[] = [];

  // Version (always 0)
  parts.push(writeUInt32(0));

  // Instance count
  parts.push(writeUInt32(instances.length));

  // Child referents
  parts.push(writeIntArray(instances.map(i => i.referent)));

  // Parent referents
  parts.push(writeIntArray(instances.map(i => i.parentReferent)));

  return createChunk('PRNT', Buffer.concat(parts));
}

/**
 * Creates END chunk (file terminator)
 */
function createEndChunk(): Buffer {
  const data = Buffer.from('</roblox>', 'binary');
  return createChunk('END\0', data);
}

/**
 * Writes a length-prefixed string
 */
function writeString(str: string): Buffer {
  const strBuf = Buffer.from(str, 'utf8');
  const lenBuf = writeUInt32(strBuf.length);
  return Buffer.concat([lenBuf, strBuf]);
}

/**
 * Writes a 32-bit unsigned integer
 */
function writeUInt32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

/**
 * Writes an array of transformed integers (RBXM interleaved format)
 */
function writeIntArray(values: number[]): Buffer {
  // Transform: positive -> 2*x, negative -> 2*|x|-1
  const transformed = values.map(v => v >= 0 ? v * 2 : -v * 2 - 1);

  // Write as little-endian 32-bit integers
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buf.writeInt32LE(transformed[i], i * 4);
  }

  return buf;
}
