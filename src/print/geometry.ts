import type { PrintSettings } from '../types';

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
  const ringSpecs: Array<[number, number]> = [
    [lowerRadius, baseZ],
    [topRadius, Math.min(topZ, baseZ + 0.2)],
    [topRadius, Math.max(baseZ, topZ - 0.1)],
    [bevelRadius, topZ],
    [dimpleRadius, topZ],
    [dimpleRadius, topZ - settings.dimpleDepthMm],
  ];
  const rings = ringSpecs.map(([radius, z]) =>
    Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2;
      return addVertex(target, centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, z);
    }),
  );

  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      addQuad(target, rings[ring][index], rings[ring][next], rings[ring + 1][next], rings[ring + 1][index]);
    }
  }

  const floorCenter = addVertex(target, centerX, centerY, topZ - settings.dimpleDepthMm);
  const bottomCenter = addVertex(target, centerX, centerY, baseZ);
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    target.triangles.push(floorCenter, rings[5][index], rings[5][next]);
    target.triangles.push(bottomCenter, rings[0][next], rings[0][index]);
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
