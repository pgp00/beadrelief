export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  return buildZip(entries, entries.map((entry) => entry.data), 0);
}

export async function createDeflatedZip(entries: ZipEntry[]): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return createStoredZip(entries);
  try {
    const compressed = await Promise.all(entries.map(async (entry) => {
      const input = new ArrayBuffer(entry.data.byteLength);
      new Uint8Array(input).set(entry.data);
      const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }));
    return buildZip(entries, compressed, 8);
  } catch {
    return createStoredZip(entries);
  }
}

function buildZip(entries: ZipEntry[], payloads: Uint8Array[], method: 0 | 8): Uint8Array {
  if (entries.length > 0xffff) throw new Error('Too many ZIP entries.');
  const names = new Set<string>();
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [entryIndex, entry] of entries.entries()) {
    if (names.has(entry.name)) throw new Error(`Duplicate ZIP entry: ${entry.name}`);
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    if (name.length > 0xffff) throw new Error(`ZIP entry name is too long: ${entry.name}`);
    if (entry.data.length > 0xffffffff) throw new Error(`ZIP entry is too large: ${entry.name}`);
    const crc = crc32(entry.data);
    const payload = payloads[entryIndex];

    const localHeader = new Uint8Array(30);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, method, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x0021, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, payload.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, name.length, true);
    locals.push(localHeader, name, payload);

    const centralHeader = new Uint8Array(46);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, method, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0x0021, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, payload.length, true);
    central.setUint32(24, entry.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(centralHeader, name);

    offset += localHeader.length + name.length + payload.length;
    if (offset > 0xffffffff) throw new Error('ZIP archive exceeds classic ZIP limits.');
  }

  const centralSize = centrals.reduce((sum, chunk) => sum + chunk.length, 0);
  if (centralSize > 0xffffffff || offset + centralSize > 0xffffffff) {
    throw new Error('ZIP central directory exceeds classic ZIP limits.');
  }
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function concat(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
