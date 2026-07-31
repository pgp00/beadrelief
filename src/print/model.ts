import { getColor } from '../palette';
import { composeVisibleCells } from '../project';
import type { AmsColor, BeadProject, PrintSettings } from '../types';
import { amsColorToPaletteColor, nearestPaletteColorOklab } from './colors';
import { appendFusedBead, createBaseMesh, type MutableMesh } from './geometry';

export type PrintablePart = {
  name: string;
  materialId: string;
  vertices: Float32Array;
  triangles: Uint32Array;
};

export type PrintableGrid = {
  width: number;
  height: number;
  cells: string[];
  materials: AmsColor[];
  settings: PrintSettings;
};

export type PrintableModel = {
  name: string;
  materials: AmsColor[];
  parts: PrintablePart[];
  gridSize: { width: number; height: number };
  settings: PrintSettings;
  sizeMm: { x: number; y: number; z: number };
};

export function composePrintableGrid(project: BeadProject): PrintableGrid {
  const palette = project.amsColors.map(amsColorToPaletteColor);
  const materialIds = new Set(project.amsColors.map((color) => color.id));
  const baseColorId = materialIds.has(project.printSettings.baseColorId)
    ? project.printSettings.baseColorId
    : project.amsColors[0].id;
  const cells = composeVisibleCells(project.layers, project.width, project.height).map((id) => {
    if (!id) return baseColorId;
    if (materialIds.has(id)) return id;
    const legacy = getColor(id);
    return legacy ? nearestPaletteColorOklab(legacy.hex, palette).id : baseColorId;
  });
  return {
    width: project.width,
    height: project.height,
    cells,
    materials: project.amsColors.map((color) => ({ ...color })),
    settings: { ...project.printSettings, baseColorId },
  };
}

export function buildPrintableModel(grid: PrintableGrid): PrintableModel {
  const widthMm = grid.width * grid.settings.cellPitchMm;
  const heightMm = grid.height * grid.settings.cellPitchMm;
  const base = createBaseMesh(widthMm, heightMm, grid.settings.baseThicknessMm);
  const usedIds = new Set([grid.settings.baseColorId, ...grid.cells]);
  const materials = grid.materials.filter((material) => usedIds.has(material.id));
  const parts: PrintablePart[] = [{
    name: 'Base',
    materialId: grid.settings.baseColorId,
    ...base,
  }];

  for (const material of materials) {
    const mesh: MutableMesh = { vertices: [], triangles: [] };
    grid.cells.forEach((materialId, index) => {
      if (materialId !== material.id) return;
      const x = (index % grid.width + 0.5) * grid.settings.cellPitchMm;
      const row = Math.floor(index / grid.width);
      const y = (grid.height - row - 0.5) * grid.settings.cellPitchMm;
      appendFusedBead(mesh, x, y, grid.settings);
    });
    if (mesh.triangles.length) {
      parts.push({
        name: `Beads_${material.name.trim().replace(/\s+/g, '_')}`,
        materialId: material.id,
        vertices: new Float32Array(mesh.vertices),
        triangles: new Uint32Array(mesh.triangles),
      });
    }
  }

  return {
    name: 'Pingdou',
    materials,
    parts,
    gridSize: { width: grid.width, height: grid.height },
    settings: { ...grid.settings },
    sizeMm: {
      x: widthMm,
      y: heightMm,
      z: grid.settings.baseThicknessMm + grid.settings.beadHeightMm,
    },
  };
}

export function meshBounds(part: PrintablePart): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < part.vertices.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], part.vertices[index + axis]);
      max[axis] = Math.max(max[axis], part.vertices[index + axis]);
    }
  }
  return {
    min: min.map(round) as [number, number, number],
    max: max.map(round) as [number, number, number],
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
