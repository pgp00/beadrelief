import { getColor } from '../palette';
import { composeVisibleCells } from '../project';
import type { AmsColor, BeadProject, PrintMode, PrintSettings } from '../types';
import { amsColorToPaletteColor, nearestPaletteColorOklab } from './colors';
import {
  appendFusedBead,
  appendFusedBeadBase,
  appendFusedBeadSection,
  appendFusedBeadTop,
  createBaseMesh,
  type MutableMesh,
} from './geometry';
import {
  buildStackPalette,
  parseStackColorId,
  STACK_LAYER_HEIGHT_MM,
  STACK_LAYERS_PER_FILAMENT,
  type StackPaletteColor,
} from './stacking';

export type PrintablePart = {
  name: string;
  materialId: string;
  vertices: Float32Array;
  triangles: Uint32Array;
};

export type SolidPrintableGrid = {
  mode: 'solid';
  width: number;
  height: number;
  cells: string[];
  materials: AmsColor[];
  settings: PrintSettings;
};

export type LayeredPrintableGrid = {
  mode: 'layered';
  width: number;
  height: number;
  stopLevels: number[];
  stackPalette: StackPaletteColor[];
  materials: AmsColor[];
  settings: PrintSettings;
  inputErrors: string[];
};

export type PrintableGrid = SolidPrintableGrid | LayeredPrintableGrid;

export type PreviewPart = {
  name: string;
  color: string;
  vertices: Float32Array;
  triangles: Uint32Array;
};

export type PrintableModel = {
  name: string;
  mode: PrintMode;
  materials: AmsColor[];
  parts: PrintablePart[];
  previewParts: PreviewPart[];
  inputErrors: string[];
  gridSize: { width: number; height: number };
  settings: PrintSettings;
  sizeMm: { x: number; y: number; z: number };
  layered?: {
    layerHeightMm: number;
    perceivedColorCount: number;
    swapCount: number;
  };
};

export function composePrintableGrid(project: BeadProject): PrintableGrid {
  if (project.printSettings.mode === 'layered') {
    const stackPalette = buildStackPalette(project.amsColors);
    const inputErrors: string[] = [];
    const minimum = STACK_LAYERS_PER_FILAMENT;
    const maximum = project.amsColors.length * STACK_LAYERS_PER_FILAMENT;
    const stopLevels = composeVisibleCells(project.layers, project.width, project.height).map((id, index) => {
      if (!id) return minimum;
      const parsed = parseStackColorId(id);
      if (parsed && parsed.stopLevel >= minimum && parsed.stopLevel <= maximum) return parsed.stopLevel;
      if (id.startsWith('stack-')) {
        inputErrors.push(`Cell ${index + 1} has an invalid layered stop color.`);
        return minimum;
      }
      const source = getColor(id);
      if (!source) {
        inputErrors.push(`Cell ${index + 1} references an unknown color.`);
        return minimum;
      }
      const nearest = nearestPaletteColorOklab(source.hex, stackPalette);
      return parseStackColorId(nearest.id)?.stopLevel ?? minimum;
    });
    return {
      mode: 'layered',
      width: project.width,
      height: project.height,
      stopLevels,
      stackPalette,
      materials: project.amsColors.map((color) => ({ ...color })),
      settings: { ...project.printSettings, baseColorId: project.amsColors[0].id },
      inputErrors,
    };
  }
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
    mode: 'solid',
    width: project.width,
    height: project.height,
    cells,
    materials: project.amsColors.map((color) => ({ ...color })),
    settings: { ...project.printSettings, baseColorId },
  };
}

export function buildPrintableModel(grid: PrintableGrid): PrintableModel {
  if (grid.mode === 'layered') return buildLayeredPrintableModel(grid);
  return buildSolidPrintableModel(grid);
}

function buildSolidPrintableModel(grid: SolidPrintableGrid): PrintableModel {
  const widthMm = grid.width * grid.settings.cellPitchMm;
  const heightMm = grid.height * grid.settings.cellPitchMm;
  const base = createBaseMesh(widthMm, heightMm, grid.settings.baseThicknessMm);
  const materials = grid.materials.map((material) => ({ ...material }));
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
    name: 'BeadRelief',
    mode: 'solid',
    materials,
    parts,
    previewParts: [],
    inputErrors: [],
    gridSize: { width: grid.width, height: grid.height },
    settings: { ...grid.settings },
    sizeMm: {
      x: widthMm,
      y: heightMm,
      z: grid.settings.baseThicknessMm + grid.settings.beadHeightMm,
    },
    layered: undefined,
  };
}

function buildLayeredPrintableModel(grid: LayeredPrintableGrid): PrintableModel {
  const parts: PrintablePart[] = [];
  const previewParts: PreviewPart[] = [];
  const widthMm = grid.width * grid.settings.cellPitchMm;
  const heightMm = grid.height * grid.settings.cellPitchMm;
  const maxStopLevel = Math.max(...grid.stopLevels);
  for (let materialIndex = 0; materialIndex < grid.materials.length; materialIndex += 1) {
    const bandStart = materialIndex * STACK_LAYERS_PER_FILAMENT;
    const bandEnd = (materialIndex + 1) * STACK_LAYERS_PER_FILAMENT;
    const mesh: MutableMesh = { vertices: [], triangles: [] };
    if (materialIndex === 0) {
      appendFusedBeadBase(mesh, grid.width, grid.height, grid.settings, grid.stopLevels.map((level) => level <= bandEnd));
    }
    grid.stopLevels.forEach((stopLevel, cellIndex) => {
      if (materialIndex === 0 || stopLevel <= bandStart) return;
      const x = (cellIndex % grid.width + 0.5) * grid.settings.cellPitchMm;
      const row = Math.floor(cellIndex / grid.width);
      const y = (grid.height - row - 0.5) * grid.settings.cellPitchMm;
      appendFusedBeadSection(
        mesh,
        x,
        y,
        grid.settings,
        grid.settings.baseThicknessMm + bandStart * STACK_LAYER_HEIGHT_MM,
        grid.settings.baseThicknessMm + Math.min(stopLevel, bandEnd) * STACK_LAYER_HEIGHT_MM,
        materialIndex === 0,
        stopLevel <= bandEnd,
      );
    });
    if (mesh.triangles.length) parts.push({
      name: `${materialIndex === 0 ? 'Base_and_Beads' : 'Stack'}_${safeName(grid.materials[materialIndex].name)}`,
      materialId: grid.materials[materialIndex].id,
      vertices: new Float32Array(mesh.vertices),
      triangles: new Uint32Array(mesh.triangles),
    });
  }
  for (const candidate of grid.stackPalette) {
    const mesh: MutableMesh = { vertices: [], triangles: [] };
    grid.stopLevels.forEach((stopLevel, cellIndex) => {
      if (stopLevel !== candidate.stopLevel) return;
      const x = (cellIndex % grid.width + 0.5) * grid.settings.cellPitchMm;
      const row = Math.floor(cellIndex / grid.width);
      const y = (grid.height - row - 0.5) * grid.settings.cellPitchMm;
      appendFusedBeadTop(mesh, x, y, grid.settings, grid.settings.baseThicknessMm + stopLevel * STACK_LAYER_HEIGHT_MM);
    });
    if (mesh.triangles.length) previewParts.push({
      name: `Estimated_${candidate.primaryCode}`,
      color: candidate.hex,
      vertices: new Float32Array(mesh.vertices),
      triangles: new Uint32Array(mesh.triangles),
    });
  }

  const effectiveSettings: PrintSettings = {
    ...grid.settings,
    beadHeightMm: maxStopLevel * STACK_LAYER_HEIGHT_MM,
    dimpleDepthMm: STACK_LAYER_HEIGHT_MM,
    baseColorId: grid.materials[0].id,
  };
  return {
    name: 'BeadRelief',
    mode: 'layered',
    materials: grid.materials.map((material) => ({ ...material })),
    parts,
    previewParts,
    inputErrors: [...grid.inputErrors],
    gridSize: { width: grid.width, height: grid.height },
    settings: effectiveSettings,
    sizeMm: {
      x: widthMm,
      y: heightMm,
      z: grid.settings.baseThicknessMm + maxStopLevel * STACK_LAYER_HEIGHT_MM,
    },
    layered: {
      layerHeightMm: STACK_LAYER_HEIGHT_MM,
      perceivedColorCount: new Set(grid.stopLevels).size,
      swapCount: Math.max(0, parts.length - 1),
    },
  };
}

function safeName(value: string): string {
  return value.trim().replace(/\s+/g, '_') || 'Filament';
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
