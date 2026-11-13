export type PdfImagePage = { jpeg: Uint8Array; pixelWidth: number; pixelHeight: number; widthPt: number; heightPt: number };
export function createImagePdf(pages: readonly PdfImagePage[]): Blob {
  if (!pages.length || pages.some(p => !p.jpeg.length || ![p.pixelWidth,p.pixelHeight].every(n => Number.isInteger(n) && n > 0) || ![p.widthPt,p.heightPt].every(n => Number.isFinite(n) && n > 0))) throw new RangeError('Invalid PDF pages');
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets: number[] = [];
  let length = 0;
  const pushText = (text: string) => {
    const bytes = encoder.encode(text);
    parts.push(toArrayBuffer(bytes));
    length += bytes.length;
  };
  const pushBytes = (bytes: Uint8Array) => {
    parts.push(toArrayBuffer(bytes));
    length += bytes.length;
  };
  const object = (id: number, chunks: Array<string | Uint8Array>) => {
    offsets[id] = length;
    pushText(`${id} 0 obj\n`);
    chunks.forEach((chunk) => (typeof chunk === 'string' ? pushText(chunk) : pushBytes(chunk)));
    pushText('\nendobj\n');
  };

  pushText('%PDF-1.4\n');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Kids [${pages.map((_, i) => `${3+i*3} 0 R`).join(' ')}] /Count ${pages.length} >>`]);
  pages.forEach((p, i) => {
    const id = 3 + i * 3;
    const content = `q\n${p.widthPt.toFixed(2)} 0 0 ${p.heightPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ`;
    object(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.widthPt.toFixed(2)} ${p.heightPt.toFixed(2)}] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`]);
    object(id+1, [`<< /Type /XObject /Subtype /Image /Width ${p.pixelWidth} /Height ${p.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
    object(id+2, [`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`]);
  });
  const start = length, count = 3 + pages.length * 3;
  pushText(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) pushText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  pushText(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
  return new Blob(parts, {type:'application/pdf'});
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
