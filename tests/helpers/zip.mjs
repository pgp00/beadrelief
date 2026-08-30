import { crc32, inflateRawSync } from "node:zlib";

const decoder = new TextDecoder();

export function readZipEntries(archive) {
  const entries = new Map();
  const records = [];
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let offset = 0;
  while (offset + 30 <= archive.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error("Truncated ZIP entry.");
    const payload = archive.subarray(dataStart, dataEnd);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP method: ${method}`);
    const name = decoder.decode(archive.subarray(nameStart, nameStart + nameLength));
    const data = method === 8 ? inflateRawSync(payload) : payload;
    const crc = view.getUint32(offset + 14, true);
    if (data.byteLength !== uncompressedSize) throw new Error(`ZIP size mismatch: ${name}`);
    if (crc32(data) !== crc) throw new Error(`ZIP CRC mismatch: ${name}`);
    entries.set(name, data);
    records.push({ name, method, compressedSize, uncompressedSize, crc, localOffset: offset });
    offset = dataEnd;
  }

  const centralOffset = offset;
  for (const record of records) {
    if (offset + 46 > archive.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory.");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const name = decoder.decode(archive.subarray(nameStart, nameStart + nameLength));
    if (view.getUint32(offset + 16, true) !== record.crc) throw new Error(`ZIP CRC mismatch: ${name}`);
    if (name !== record.name
      || view.getUint16(offset + 10, true) !== record.method
      || view.getUint32(offset + 20, true) !== record.compressedSize
      || view.getUint32(offset + 24, true) !== record.uncompressedSize
      || view.getUint32(offset + 42, true) !== record.localOffset) {
      throw new Error(`Invalid ZIP central entry: ${name}`);
    }
    offset = nameStart + nameLength + extraLength + commentLength;
  }

  if (offset + 22 > archive.length || view.getUint32(offset, true) !== 0x06054b50
    || view.getUint16(offset + 8, true) !== records.length
    || view.getUint16(offset + 10, true) !== records.length
    || view.getUint32(offset + 12, true) !== offset - centralOffset
    || view.getUint32(offset + 16, true) !== centralOffset
    || offset + 22 + view.getUint16(offset + 20, true) !== archive.length) {
    throw new Error("Invalid ZIP end record.");
  }
  return entries;
}
