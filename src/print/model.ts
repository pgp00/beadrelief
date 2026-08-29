import { getColor } from '../palette';
import { DEFAULT_MATERIAL_PROFILE, composeVisibleCells } from '../project';
import type { AmsColor, BeadProject, PrintMode, PrintSettings } from '../types';
import { amsColorToPaletteColor, nearestPaletteColorOklab } from './colors';
import {
  appendFusedBead,
  appendFusedBeadBase,
  appendFusedBeadSection,
  appendFusedBeadTop,
  appendBox,
  appendRing,
  createBaseMesh,
  type MutableMesh,
} from './geometry';
import {
  buildStackPalette,
  applyMeasuredStackColors,
  parseStackColorId,
  STACK_LAYER_HEIGHT_MM,
  STACK_LAYERS_PER_FILAMENT,
  type StackPaletteColor,
} from './stacking';
import { buildGridPrintRecipe, type PrintRecipe } from './recipe';
import { DEFAULT_PRINT_SETTINGS } from './settings';

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
  materialProfile: BeadProject['materialProfile'];
  inputErrors: string[];
};

export type LayeredPrintableGrid = {
  mode: 'layered';
  width: number;
  height: number;
  stopLevels: number[];
  stackPalette: StackPaletteColor[];
  materials: AmsColor[];
  settings: PrintSettings;
  materialProfile: BeadProject['materialProfile'];
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
  recipe: PrintRecipe;
  materialProfile: BeadProject['materialProfile'];
};

export function composePrintableGrid(project: BeadProject): PrintableGrid {
  const materialProfile = project.materialProfile ?? DEFAULT_MATERIAL_PROFILE;
  const printSettings = { ...DEFAULT_PRINT_SETTINGS, ...project.printSettings };
  if (printSettings.mode === 'layered') {
    const stackPalette = applyMeasuredStackColors(buildStackPalette(project.amsColors), materialProfile.measuredColors);
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
      settings: { ...printSettings, baseColorId: project.amsColors[0].id },
      materialProfile: { ...materialProfile, measuredColors: materialProfile.measuredColors.map((color) => ({ ...color })) },
      inputErrors,
    };
  }
  const palette = project.amsColors.map(amsColorToPaletteColor);
  const materialIds = new Set(project.amsColors.map((color) => color.id));
  const baseColorId = materialIds.has(printSettings.baseColorId)
    ? printSettings.baseColorId
    : project.amsColors[0].id;
  const inputErrors: string[] = [];
  const cells = composeVisibleCells(project.layers, project.width, project.height).map((id, index) => {
    if (!id) return baseColorId;
    if (materialIds.has(id)) return id;
    const legacy = getColor(id);
    if (legacy) return nearestPaletteColorOklab(legacy.hex, palette).id;
    inputErrors.push(`Cell ${index + 1} references an unknown color.`);
    return baseColorId;
  });
  return {
    mode: 'solid',
    width: project.width,
    height: project.height,
    cells,
    materials: project.amsColors.map((color) => ({ ...color })),
    settings: { ...printSettings, baseColorId },
    materialProfile: { ...materialProfile, measuredColors: materialProfile.measuredColors.map((color) => ({ ...color })) },
    inputErrors,
  };
}

export function buildPrintableModel(grid: PrintableGrid): PrintableModel {
  if (grid.mode === 'layered') return buildLayeredPrintableModel(grid);
  return buildSolidPrintableModel(grid);
}

function buildSolidPrintableModel(grid: SolidPrintableGrid): PrintableModel {
  const border = grid.settings.borderWidthMm;
  const widthMm = grid.width * grid.settings.cellPitchMm + border * 2;
  const baseHeightMm = grid.height * grid.settings.cellPitchMm + border * 2;
  const loopOuterRadius = grid.settings.hangingHoleDiameterMm > 0 ? grid.settings.hangingHoleDiameterMm / 2 + 2.5 : 0;
  const heightMm = baseHeightMm + loopOuterRadius * 2;
  const base = createBaseMesh(widthMm, baseHeightMm, grid.settings.baseThicknessMm, grid.settings.backText);
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
      const x = border + (index % grid.width + 0.5) * grid.settings.cellPitchMm;
      const row = Math.floor(index / grid.width);
      const y = border + (grid.height - row - 0.5) * grid.settings.cellPitchMm;
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
  appendStructureParts(parts, grid.settings, widthMm, baseHeightMm, grid.settings.beadHeightMm);

  return {
    name: 'BeadRelief',
    mode: 'solid',
    materials,
    parts,
    previewParts: [],
    inputErrors: [...grid.inputErrors],
    gridSize: { width: grid.width, height: grid.height },
    settings: { ...grid.settings },
    sizeMm: {
      x: widthMm,
      y: heightMm,
      z: grid.settings.baseThicknessMm + grid.settings.beadHeightMm,
    },
    layered: undefined,
    recipe: buildGridPrintRecipe(grid),
    materialProfile: { ...grid.materialProfile, measuredColors: grid.materialProfile.measuredColors.map((color) => ({ ...color })) },
  };
}

function buildLayeredPrintableModel(grid: LayeredPrintableGrid): PrintableModel {
  const parts: PrintablePart[] = [];
  const previewParts: PreviewPart[] = [];
  const border = grid.settings.borderWidthMm;
  const widthMm = grid.width * grid.settings.cellPitchMm + border * 2;
  const baseHeightMm = grid.height * grid.settings.cellPitchMm + border * 2;
  const loopOuterRadius = grid.settings.hangingHoleDiameterMm > 0 ? grid.settings.hangingHoleDiameterMm / 2 + 2.5 : 0;
  const heightMm = baseHeightMm + loopOuterRadius * 2;
  const maxStopLevel = Math.max(...grid.stopLevels);
  const detachedBase = grid.settings.separateBase || border > 0 || loopOuterRadius > 0 || Boolean(grid.settings.backText);
  if (detachedBase) parts.push({
    name: 'Base',
    materialId: grid.materials[0].id,
    ...createBaseMesh(widthMm, baseHeightMm, grid.settings.baseThicknessMm, grid.settings.backText),
  });
  for (let materialIndex = 0; materialIndex < grid.materials.length; materialIndex += 1) {
    const bandStart = materialIndex * STACK_LAYERS_PER_FILAMENT;
    const bandEnd = (materialIndex + 1) * STACK_LAYERS_PER_FILAMENT;
    const mesh: MutableMesh = { vertices: [], triangles: [] };
    if (materialIndex === 0 && !detachedBase) {
      appendFusedBeadBase(mesh, grid.width, grid.height, grid.settings, grid.stopLevels.map((level) => level <= bandEnd));
    }
    grid.stopLevels.forEach((stopLevel, cellIndex) => {
      if ((!detachedBase && materialIndex === 0) || stopLevel <= bandStart) return;
      const x = border + (cellIndex % grid.width + 0.5) * grid.settings.cellPitchMm;
      const row = Math.floor(cellIndex / grid.width);
      const y = border + (grid.height - row - 0.5) * grid.settings.cellPitchMm;
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
      name: `${materialIndex === 0 && !detachedBase ? 'Base_and_Beads' : 'Stack'}_${safeName(grid.materials[materialIndex].name)}`,
      materialId: grid.materials[materialIndex].id,
      vertices: new Float32Array(mesh.vertices),
      triangles: new Uint32Array(mesh.triangles),
    });
  }
  for (const candidate of grid.stackPalette) {
    const mesh: MutableMesh = { vertices: [], triangles: [] };
    grid.stopLevels.forEach((stopLevel, cellIndex) => {
      if (stopLevel !== candidate.stopLevel) return;
      const x = border + (cellIndex % grid.width + 0.5) * grid.settings.cellPitchMm;
      const row = Math.floor(cellIndex / grid.width);
      const y = border + (grid.height - row - 0.5) * grid.settings.cellPitchMm;
      appendFusedBeadTop(mesh, x, y, grid.settings, grid.settings.baseThicknessMm + stopLevel * STACK_LAYER_HEIGHT_MM);
    });
    if (mesh.triangles.length) previewParts.push({
      name: `Estimated_${candidate.primaryCode}`,
      color: candidate.hex,
      vertices: new Float32Array(mesh.vertices),
      triangles: new Uint32Array(mesh.triangles),
    });
  }
  appendStructureParts(parts, grid.settings, widthMm, baseHeightMm, maxStopLevel * STACK_LAYER_HEIGHT_MM);

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
      swapCount: Math.max(0, grid.materials.filter((_, index) => maxStopLevel > index * STACK_LAYERS_PER_FILAMENT).length - 1),
    },
    recipe: buildGridPrintRecipe(grid),
    materialProfile: { ...grid.materialProfile, measuredColors: grid.materialProfile.measuredColors.map((color) => ({ ...color })) },
  };
}

function appendStructureParts(
  parts: PrintablePart[],
  settings: PrintSettings,
  widthMm: number,
  heightMm: number,
  reliefHeightMm: number,
): void {
  if (settings.borderWidthMm > 0) {
    const width = settings.borderWidthMm;
    const mesh: MutableMesh = { vertices: [], triangles: [] };
    const top = settings.baseThicknessMm + reliefHeightMm;
    appendBox(mesh, 0, 0, settings.baseThicknessMm, widthMm, width, top);
    appendBox(mesh, 0, heightMm - width, settings.baseThicknessMm, widthMm, heightMm, top);
    appendBox(mesh, 0, width, settings.baseThicknessMm, width, heightMm - width, top);
    appendBox(mesh, widthMm - width, width, settings.baseThicknessMm, widthMm, heightMm - width, top);
    parts.push({ name: 'Border', materialId: settings.baseColorId, vertices: new Float32Array(mesh.vertices), triangles: new Uint32Array(mesh.triangles) });
  }
  if (settings.hangingHoleDiameterMm > 0) {
    const inner = settings.hangingHoleDiameterMm / 2;
    const outer = inner + 2.5;
    const centerX = widthMm / 2;
    const centerY = heightMm + outer;
    const mesh: MutableMesh = { vertices: [], triangles: [] };
    appendRing(mesh, centerX, centerY, inner, outer, settings.baseThicknessMm);
    appendBox(mesh, centerX - outer, Math.max(0, heightMm - 2.5), 0, centerX + outer, centerY - inner, settings.baseThicknessMm);
    parts.push({ name: 'Hanging_Loop', materialId: settings.baseColorId, vertices: new Float32Array(mesh.vertices), triangles: new Uint32Array(mesh.triangles) });
  }
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
