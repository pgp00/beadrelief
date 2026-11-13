export type PdfPaper = 'a4' | 'letter';
export type GridBounds = { x: number; y: number; width: number; height: number };
export type PdfTile = GridBounds & { tileRow: number; tileColumn: number };
export function pdfPaperSize(paper: PdfPaper) {
  if (paper !== 'a4' && paper !== 'letter') throw new RangeError('Invalid paper');
  return paper === 'a4' ? { widthPt: 210 * 72 / 25.4, heightPt: 297 * 72 / 25.4 } : { widthPt: 612, heightPt: 792 };
}
export function patternBounds(cells: readonly (string | null)[], width: number, height: number): GridBounds | null {
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 180) || cells.length !== width * height) throw new RangeError('Invalid grid');
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  cells.forEach((c, i) => { if (c) { const x = i % width, y = Math.floor(i / width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } });
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
export function paginateGrid(b: GridBounds): PdfTile[] {
  if (![b.x, b.y, b.width, b.height].every(Number.isInteger) || b.x < 0 || b.y < 0 || b.width < 1 || b.height < 1 || b.x + b.width > 180 || b.y + b.height > 180) throw new RangeError('Invalid PDF bounds');
  const tiles: PdfTile[] = [];
  for (let y = 0; y < b.height; y += 29) for (let x = 0; x < b.width; x += 29) tiles.push({ x: b.x + x, y: b.y + y, width: Math.min(29, b.width - x), height: Math.min(29, b.height - y), tileRow: y / 29, tileColumn: x / 29 });
  return tiles;
}
