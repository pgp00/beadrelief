import type { PrintSettings } from '../types';
import { STACK_LAYER_HEIGHT_MM } from './stacking';

export type MutableMesh = {
  vertices: number[];
  triangles: number[];
};

export type MeshData = {
  vertices: Float32Array;
  triangles: Uint32Array;
};

export function createBaseMesh(widthMm: number, heightMm: number, thicknessMm: number, backText = ''): MeshData {
  if (backText) return createRecessedTextBase(widthMm, heightMm, thicknessMm, backText);
  const vertices = new Float32Array([
    0, 0, 0,
    widthMm, 0, 0,
    widthMm, heightMm, 0,
    0, heightMm, 0,
    0, 0, thicknessMm,
    widthMm, 0, thicknessMm,
    widthMm, heightMm, thicknessMm,
    0, heightMm, thicknessMm,
  ]);
  const triangles = new Uint32Array([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ]);
  return { vertices, triangles };
}

export function appendBox(target: MutableMesh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
  const first = target.vertices.length / 3;
  target.vertices.push(
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  );
  target.triangles.push(
    first, first + 2, first + 1, first, first + 3, first + 2,
    first + 4, first + 5, first + 6, first + 4, first + 6, first + 7,
    first, first + 1, first + 5, first, first + 5, first + 4,
    first + 1, first + 2, first + 6, first + 1, first + 6, first + 5,
    first + 2, first + 3, first + 7, first + 2, first + 7, first + 6,
    first + 3, first, first + 4, first + 3, first + 4, first + 7,
  );
}

export function appendRing(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  height: number,
  segments = 32,
): void {
  const rings = createRings(target, centerX, centerY, [
    [outerRadius, 0], [outerRadius, height], [innerRadius, height], [innerRadius, 0],
  ], segments, 0);
  connectRings(target, rings);
  connectRingPair(target, rings[3], rings[0]);
}

const FONT_3X5: Record<string, string> = {
  A: '010/101/111/101/101', B: '110/101/110/101/110', C: '011/100/100/100/011', D: '110/101/101/101/110',
  E: '111/100/110/100/111', F: '111/100/110/100/100', G: '011/100/101/101/011', H: '101/101/111/101/101',
  I: '111/010/010/010/111', J: '001/001/001/101/010', K: '101/101/110/101/101', L: '100/100/100/100/111',
  M: '101/111/111/101/101', N: '101/111/111/111/101', O: '010/101/101/101/010', P: '110/101/110/100/100',
  Q: '010/101/101/111/011', R: '110/101/110/101/101', S: '011/100/010/001/110', T: '111/010/010/010/010',
  U: '101/101/101/101/111', V: '101/101/101/101/010', W: '101/101/111/111/101', X: '101/101/010/101/101',
  Y: '101/101/010/010/010', Z: '111/001/010/100/111',
  0: '111/101/101/101/111', 1: '010/110/010/010/111', 2: '110/001/010/100/111', 3: '110/001/010/001/110',
  4: '101/101/111/001/001', 5: '111/100/110/001/110', 6: '011/100/111/101/111', 7: '111/001/010/010/010',
  8: '111/101/111/101/111', 9: '111/101/111/001/110', '-': '000/000/111/000/000', ' ': '000/000/000/000/000',
};

function createRecessedTextBase(widthMm: number, heightMm: number, thicknessMm: number, value: string): MeshData {
  const text = value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 12);
  const pixel = Math.min(1.2, (widthMm - 4) / Math.max(1, text.length * 4 - 1), (heightMm - 4) / 5);
  if (!text || pixel < 0.35) return createBaseMesh(widthMm, heightMm, thicknessMm);
  const depth = Math.min(0.3, thicknessMm / 3);
  const mesh: MutableMesh = { vertices: [], triangles: [] };
  appendBox(mesh, 0, 0, depth, widthMm, heightMm, thicknessMm);
  const textWidth = (text.length * 4 - 1) * pixel;
  const originX = (widthMm - textWidth) / 2;
  const originY = (heightMm - 5 * pixel) / 2;
  appendBox(mesh, 0, 0, 0, widthMm, originY, depth);
  appendBox(mesh, 0, originY + 5 * pixel, 0, widthMm, heightMm, depth);
  for (let row = 0; row < 5; row += 1) {
    const holes: Array<[number, number]> = [];
    [...text].forEach((char, index) => {
      const bits = (FONT_3X5[char] ?? FONT_3X5[' ']).split('/')[4 - row];
      [...bits].forEach((bit, column) => {
        if (bit === '1') holes.push([
          originX + (index * 4 + column) * pixel,
          originX + (index * 4 + column + 1) * pixel,
        ]);
      });
    });
    holes.sort((left, right) => left[0] - right[0]);
    let cursor = 0;
    for (const [start, end] of holes) {
      appendBox(mesh, cursor, originY + row * pixel, 0, start, originY + (row + 1) * pixel, depth);
      cursor = Math.max(cursor, end);
    }
    appendBox(mesh, cursor, originY + row * pixel, 0, widthMm, originY + (row + 1) * pixel, depth);
  }
  return { vertices: new Float32Array(mesh.vertices), triangles: new Uint32Array(mesh.triangles) };
}

export function appendFusedBead(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  settings: PrintSettings,
  segments = 24,
): void {
  const topRadius = settings.cellPitchMm / 2;
  const lowerRadius = topRadius - 0.15;
  const bevelRadius = topRadius - 0.05;
  const dimpleRadius = settings.dimpleDiameterMm / 2;
  const baseZ = settings.baseThicknessMm;
  const topZ = baseZ + settings.beadHeightMm;
  const hasDimple = dimpleRadius > 0 && settings.dimpleDepthMm > 0;
  const ringSpecs: Array<[number, number]> = [
    [lowerRadius, baseZ],
    [topRadius, baseZ + Math.min(0.2, settings.beadHeightMm * 0.25)],
    [topRadius, topZ - Math.min(0.1, settings.beadHeightMm * 0.25)],
    [bevelRadius, topZ],
  ];
  if (hasDimple) {
    ringSpecs.push(
      [dimpleRadius, topZ],
      [dimpleRadius, topZ - settings.dimpleDepthMm],
    );
  }
  appendClosedRings(target, centerX, centerY, ringSpecs, segments);
}

export function appendFusedBeadSection(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  settings: PrintSettings,
  bottomZ: number,
  topZ: number,
  firstBand: boolean,
  exposedTop: boolean,
  segments = 24,
): void {
  appendClosedRings(target, centerX, centerY, beadSectionSpecs(settings, bottomZ, topZ, firstBand, exposedTop), segments);
}

export function appendFusedBeadBase(
  target: MutableMesh,
  width: number,
  height: number,
  settings: PrintSettings,
  exposedTops: boolean[],
  segments = 24,
): void {
  const pitch = settings.cellPitchMm;
  const widthMm = width * pitch;
  const heightMm = height * pitch;
  const halfPitch = pitch / 2;
  const topVertices = new Map<string, { index: number; x: number; y: number }>();
  const topVertex = (x: number, y: number) => {
    const snappedX = Math.abs(x) < 1e-9 ? 0 : Math.abs(x - widthMm) < 1e-9 ? widthMm : x;
    const snappedY = Math.abs(y) < 1e-9 ? 0 : Math.abs(y - heightMm) < 1e-9 ? heightMm : y;
    const key = `${snappedX.toFixed(9)}:${snappedY.toFixed(9)}`;
    const existing = topVertices.get(key);
    if (existing) return existing.index;
    const vertex = { index: addVertex(target, snappedX, snappedY, settings.baseThicknessMm), x: snappedX, y: snappedY };
    topVertices.set(key, vertex);
    return vertex.index;
  };
  const firstBandTop = settings.baseThicknessMm + STACK_LAYER_HEIGHT_MM * 4;

  for (let cellIndex = 0; cellIndex < width * height; cellIndex += 1) {
    const centerX = (cellIndex % width + 0.5) * pitch;
    const row = Math.floor(cellIndex / width);
    const centerY = (height - row - 0.5) * pitch;
    const specs = beadSectionSpecs(
      settings,
      settings.baseThicknessMm,
      firstBandTop,
      true,
      exposedTops[cellIndex] ?? false,
    );
    const bottomRing = createRings(target, centerX, centerY, [specs[0]], segments, 0)[0];
    const squareRing = Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const scale = halfPitch / Math.max(Math.abs(cosine), Math.abs(sine));
      return topVertex(centerX + cosine * scale, centerY + sine * scale);
    });
    connectRingPair(target, squareRing, bottomRing);
    const upperRings = createRings(target, centerX, centerY, specs.slice(1), segments, 0);
    appendClosedRingSet(target, [bottomRing, ...upperRings], specs, false, centerX, centerY);
  }

  const perimeter = [...topVertices.values()]
    .filter(({ x, y }) => x === 0 || x === widthMm || y === 0 || y === heightMm)
    .sort((a, b) => Math.atan2(a.y - heightMm / 2, a.x - widthMm / 2)
      - Math.atan2(b.y - heightMm / 2, b.x - widthMm / 2));
  const bottom = perimeter.map(({ x, y }) => addVertex(target, x, y, 0));
  const bottomCenter = addVertex(target, widthMm / 2, heightMm / 2, 0);
  for (let index = 0; index < perimeter.length; index += 1) {
    const next = (index + 1) % perimeter.length;
    addQuad(target, perimeter[index].index, bottom[index], bottom[next], perimeter[next].index);
    target.triangles.push(bottomCenter, bottom[next], bottom[index]);
  }
}

function beadSectionSpecs(
  settings: PrintSettings,
  bottomZ: number,
  topZ: number,
  firstBand: boolean,
  exposedTop: boolean,
): Array<[number, number]> {
  const topRadius = settings.cellPitchMm / 2;
  const lowerRadius = topRadius - 0.15;
  const bevelRadius = topRadius - 0.05;
  const dimpleRadius = settings.dimpleDiameterMm / 2;
  const rings: Array<[number, number]> = firstBand
    ? [[lowerRadius, bottomZ], [topRadius, Math.min(topZ, bottomZ + STACK_LAYER_HEIGHT_MM)]]
    : [[topRadius, bottomZ]];
  const pushDistinct = (radius: number, z: number) => {
    const last = rings[rings.length - 1];
    if (!last || Math.abs(last[0] - radius) > 1e-9 || Math.abs(last[1] - z) > 1e-9) rings.push([radius, z]);
  };
  if (exposedTop) {
    pushDistinct(topRadius, Math.max(bottomZ, topZ - STACK_LAYER_HEIGHT_MM));
    pushDistinct(bevelRadius, topZ);
    if (dimpleRadius > 0) {
      pushDistinct(dimpleRadius, topZ);
      pushDistinct(dimpleRadius, topZ - STACK_LAYER_HEIGHT_MM);
    }
  } else {
    pushDistinct(topRadius, topZ);
  }
  return rings;
}

export function appendFusedBeadTop(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  settings: PrintSettings,
  topZ: number,
  segments = 24,
): void {
  const rings: Array<[number, number]> = [
    [settings.cellPitchMm / 2, topZ - STACK_LAYER_HEIGHT_MM],
    [settings.cellPitchMm / 2 - 0.05, topZ],
  ];
  const dimpleRadius = settings.dimpleDiameterMm / 2;
  if (dimpleRadius > 0) rings.push(
    [dimpleRadius, topZ],
    [dimpleRadius, topZ - STACK_LAYER_HEIGHT_MM],
  );
  appendOpenTopRings(target, centerX, centerY, rings, segments, 0.002);
}

function appendClosedRings(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  specs: Array<[number, number]>,
  segments: number,
): void {
  const rings = createRings(target, centerX, centerY, specs, segments, 0);
  appendClosedRingSet(target, rings, specs, true, centerX, centerY);
}

function appendClosedRingSet(
  target: MutableMesh,
  rings: number[][],
  specs: Array<[number, number]>,
  capBottom: boolean,
  centerX: number,
  centerY: number,
): void {
  connectRings(target, rings);
  const last = specs.length - 1;
  if (Math.abs(specs[0][1] - specs[last][1]) < 1e-9 && Math.abs(specs[0][0] - specs[last][0]) > 1e-9) {
    connectRingPair(target, rings[last], rings[0]);
    return;
  }
  const bottomCenter = capBottom
    ? addVertex(target, centerX, centerY, specs[0][1])
    : -1;
  const topCenter = addVertex(target, centerX, centerY, specs[last][1]);
  for (let index = 0; index < rings[0].length; index += 1) {
    const next = (index + 1) % rings[0].length;
    if (capBottom) target.triangles.push(bottomCenter, rings[0][next], rings[0][index]);
    target.triangles.push(topCenter, rings[rings.length - 1][index], rings[rings.length - 1][next]);
  }
}

function appendOpenTopRings(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  specs: Array<[number, number]>,
  segments: number,
  zOffset: number,
): void {
  const rings = createRings(target, centerX, centerY, specs, segments, zOffset);
  connectRings(target, rings);
  const topCenter = addVertex(target, centerX, centerY, specs[specs.length - 1][1] + zOffset);
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    target.triangles.push(topCenter, rings[rings.length - 1][index], rings[rings.length - 1][next]);
  }
}

function createRings(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  specs: Array<[number, number]>,
  segments: number,
  zOffset: number,
): number[][] {
  return specs.map(([radius, z]) => Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return addVertex(target, centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, z + zOffset);
  }));
}

function connectRings(target: MutableMesh, rings: number[][]): void {
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    connectRingPair(target, rings[ring], rings[ring + 1]);
  }
}

function connectRingPair(target: MutableMesh, first: number[], second: number[]): void {
  for (let index = 0; index < first.length; index += 1) {
    const next = (index + 1) % first.length;
    addQuad(target, first[index], first[next], second[next], second[index]);
  }
}

function addVertex(target: MutableMesh, x: number, y: number, z: number): number {
  const index = target.vertices.length / 3;
  target.vertices.push(x, y, z);
  return index;
}

function addQuad(target: MutableMesh, a: number, b: number, c: number, d: number): void {
  target.triangles.push(a, b, c, a, c, d);
}
