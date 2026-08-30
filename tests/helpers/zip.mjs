import { inflateRawSync } from "node:zlib";

const decoder = new TextDecoder();

export function readZipEntries(archive) {
  const entries = new Map();
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let offset = 0;
  while (offset + 30 <= archive.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const payload = archive.subarray(dataStart, dataStart + size);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP method: ${method}`);
    entries.set(
      decoder.decode(archive.subarray(nameStart, nameStart + nameLength)),
      method === 8 ? inflateRawSync(payload) : payload,
    );
    offset = dataStart + size;
  }
  if (offset + 4 > archive.length || view.getUint32(offset, true) !== 0x02014b50) {
    throw new Error("Invalid ZIP central directory.");
  }
  return entries;
}
