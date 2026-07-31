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

export function createBaseMesh(widthMm: number, heightMm: number, thicknessMm: number): MeshData {
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

export function appendMesh(target: MutableMesh, source: MeshData): void {
  const offset = target.vertices.length / 3;
  target.vertices.push(...source.vertices);
  target.triangles.push(...[...source.triangles].map((index) => index + offset));
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
  appendClosedRings(target, centerX, centerY, rings, segments);
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
  connectRings(target, rings);
  const bottomCenter = addVertex(target, centerX, centerY, specs[0][1]);
  const topCenter = addVertex(target, centerX, centerY, specs[specs.length - 1][1]);
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    target.triangles.push(bottomCenter, rings[0][next], rings[0][index]);
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
    for (let index = 0; index < rings[ring].length; index += 1) {
      const next = (index + 1) % rings[ring].length;
      addQuad(target, rings[ring][index], rings[ring][next], rings[ring + 1][next], rings[ring + 1][index]);
    }
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
