import type { BeadProject, ClipboardPattern, MirrorDirection } from './types.js';

export function getActiveLayerCells(project: BeadProject): Array<string | null> {
  return project.layers.find((layer) => layer.id === project.activeLayerId)!.cells;
}

export function collectRecolorIndices(project: BeadProject, sourceColorId: string): number[] {
  const indices = new Set<number>();
  project.layers.forEach((layer) => {
    if (!layer.visible || layer.locked) return;
    layer.cells.forEach((colorId, index) => {
      if (colorId === sourceColorId) indices.add(index);
    });
  });
  return [...indices];
}

export function collectBrushIndices(centerX: number, centerY: number, size: number, width: number, height: number): number[] {
  if (size <= 0.5) {
    const x = Math.floor(centerX);
    const y = Math.floor(centerY);
    return x >= 0 && y >= 0 && x < width && y < height ? [y * width + x] : [];
  }
  const diameter = Math.max(1, Math.round(size));
  const radius = diameter / 2;
  const minX = Math.max(0, Math.floor(centerX - radius - 0.5));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius - 0.5));
  const minY = Math.max(0, Math.floor(centerY - radius - 0.5));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius - 0.5));
  const indices: number[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (circleIntersectsCell(centerX, centerY, radius, x, y)) indices.push(y * width + x);
    }
  }
  return indices;
}

export function circleIntersectsCell(centerX: number, centerY: number, radius: number, cellX: number, cellY: number): boolean {
  const activationInset = 0.3;
  const closestX = Math.max(cellX + activationInset, Math.min(cellX + 1 - activationInset, centerX));
  const closestY = Math.max(cellY + activationInset, Math.min(cellY + 1 - activationInset, centerY));
  const dx = closestX - centerX;
  const dy = closestY - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

export function collectFloodFillIndices(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
  selectedColorId: string,
): number[] {
  const startIndex = y * width + x;
  if (cells[startIndex] === selectedColorId) return [startIndex];
  return collectConnectedCellIndices(cells, width, height, x, y);
}

export function collectConnectedCellIndices(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
): number[] {
  const startIndex = y * width + x;
  const target = cells[startIndex];
  const seen = new Set<number>();
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number];
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const index = cy * width + cx;
    if (seen.has(index) || cells[index] !== target) continue;
    seen.add(index);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return [...seen];
}

export function collectSameColorIndices(cells: Array<string | null>, x: number, y: number, width: number): number[] {
  const target = cells[y * width + x];
  if (!target) return [];
  return cells.flatMap((colorId, index) => (colorId === target ? [index] : []));
}

export function createClipboardPattern(cells: Array<string | null>, width: number, indices: number[]): ClipboardPattern {
  if (indices.length === 0) return { width: 0, height: 0, cells: [] };
  let minX = width;
  let maxX = -1;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = -1;
  indices.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const patternWidth = maxX - minX + 1;
  const patternHeight = maxY - minY + 1;
  const patternCells = Array<string | null>(patternWidth * patternHeight).fill(null);
  indices.forEach((index) => {
    const colorId = cells[index];
    if (!colorId) return;
    const x = index % width;
    const y = Math.floor(index / width);
    patternCells[(y - minY) * patternWidth + (x - minX)] = colorId;
  });
  return { width: patternWidth, height: patternHeight, cells: patternCells };
}

export function pasteClipboardPattern(
  cells: Array<string | null>,
  width: number,
  height: number,
  pattern: ClipboardPattern,
  startX: number,
  startY: number,
): Array<string | null> {
  const next = cells.slice();
  pattern.cells.forEach((colorId, index) => {
    if (!colorId) return;
    const x = startX + (index % pattern.width);
    const y = startY + Math.floor(index / pattern.width);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    next[y * width + x] = colorId;
  });
  return next;
}

export function shiftCells(
  cells: Array<string | null>,
  width: number,
  height: number,
  dx: number,
  dy: number,
  selectionIndices: number[] = [],
): Array<string | null> {
  if (dx === 0 && dy === 0) return cells.slice();
  const moveIndices = selectionIndices.length > 0 ? selectionIndices : cells.flatMap((colorId, index) => (colorId ? [index] : []));
  const next = selectionIndices.length > 0 ? cells.slice() : Array<string | null>(width * height).fill(null);
  if (selectionIndices.length > 0) moveIndices.forEach((index) => { next[index] = null; });
  moveIndices.forEach((index) => {
    const colorId = cells[index];
    if (!colorId) return;
    const x = index % width;
    const y = Math.floor(index / width);
    const nextX = x + dx;
    const nextY = y + dy;
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) return;
    next[nextY * width + nextX] = colorId;
  });
  return next;
}

export function clampShiftDelta(
  cells: Array<string | null>,
  width: number,
  height: number,
  dx: number,
  dy: number,
  selectionIndices: number[] = [],
): { dx: number; dy: number } {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  const moveIndices = selectionIndices.length > 0 ? selectionIndices : cells.flatMap((colorId, index) => (colorId ? [index] : []));
  moveIndices.forEach((index) => {
    if (!cells[index]) return;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  if (maxX < 0 || maxY < 0) return { dx: 0, dy: 0 };
  return {
    dx: Math.min(width - 1 - maxX, Math.max(-minX, dx)),
    dy: Math.min(height - 1 - maxY, Math.max(-minY, dy)),
  };
}

export function canShiftSelection(
  cells: Array<string | null>,
  width: number,
  height: number,
  dx: number,
  dy: number,
  selectionIndices: number[],
): boolean {
  const selected = new Set(selectionIndices);
  return selectionIndices.every((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const nextX = x + dx;
    const nextY = y + dy;
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) return false;
    const nextIndex = nextY * width + nextX;
    return selected.has(nextIndex) || !cells[nextIndex];
  });
}

export function mirrorCells(
  cells: Array<string | null>,
  width: number,
  height: number,
  direction: MirrorDirection,
  selectionIndices: number[] = [],
): Array<string | null> {
  const moveIndices = selectionIndices.length > 0 ? selectionIndices : cells.flatMap((colorId, index) => (colorId ? [index] : []));
  if (moveIndices.length === 0) return cells;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  moveIndices.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const selected = new Set(moveIndices);
  const next = selectionIndices.length > 0 ? cells.slice() : Array<string | null>(width * height).fill(null);
  if (selectionIndices.length > 0) {
    const canMirror = moveIndices.every((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      const nextX = direction === 'horizontal' ? minX + maxX - x : x;
      const nextY = direction === 'vertical' ? minY + maxY - y : y;
      const nextIndex = nextY * width + nextX;
      return selected.has(nextIndex) || !cells[nextIndex];
    });
    if (!canMirror) return cells;
    moveIndices.forEach((index) => { next[index] = null; });
  }
  moveIndices.forEach((index) => {
    const colorId = cells[index];
    if (!colorId) return;
    const x = index % width;
    const y = Math.floor(index / width);
    const nextX = direction === 'horizontal' ? minX + maxX - x : x;
    const nextY = direction === 'vertical' ? minY + maxY - y : y;
    next[nextY * width + nextX] = colorId;
  });
  return next;
}

export function collectConnectedOccupiedIndices(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
): number[] {
  const startIndex = y * width + x;
  if (!cells[startIndex]) return [];
  const seen = new Set<number>();
  const stack = [[x, y]];
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number];
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const index = cy * width + cx;
    if (seen.has(index) || !cells[index]) continue;
    seen.add(index);
    neighbors.forEach(([dx, dy]) => stack.push([cx + dx, cy + dy]));
  }
  return [...seen];
}

export function floodFill(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
  selectedColorId: string,
): Array<string | null> {
  const next = cells.slice();
  if (next[y * width + x] === selectedColorId) return next;
  collectConnectedCellIndices(cells, width, height, x, y).forEach((index) => { next[index] = selectedColorId; });
  return next;
}
