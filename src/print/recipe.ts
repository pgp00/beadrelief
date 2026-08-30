import { composeVisibleCells } from '../project';
import type { BeadProject } from '../types';
import type { PrintableGrid } from './model';
import { buildStackPalette, parseStackColorId, STACK_LAYER_HEIGHT_MM, STACK_LAYERS_PER_FILAMENT } from './stacking';

export type PrintRecipe = {
  mode: 'solid' | 'layered';
  baseThicknessMm: number;
  layerHeightMm: number | null;
  slots: Array<{ slot: number; id: string; name: string; hex: string; tdMm: number }>;
  layers: Array<{ layer: number; slot: number; material: string; zStartMm: number; zEndMm: number }>;
  stops: Array<{ stopLevel: number; estimatedHex: string; measuredHex: string | null; cells: number }>;
};

export function buildPrintRecipe(project: BeadProject): PrintRecipe {
  if (project.printSettings.mode === 'solid') {
    return recipeFromValues(project.printSettings.baseThicknessMm, project.amsColors, [], project.materialProfile.measuredColors);
  }
  const stopLevels = composeVisibleCells(project.layers, project.width, project.height).map((id) => (
    id ? parseStackColorId(id)?.stopLevel ?? STACK_LAYERS_PER_FILAMENT : STACK_LAYERS_PER_FILAMENT
  ));
  return recipeFromValues(project.printSettings.baseThicknessMm, project.amsColors, stopLevels, project.materialProfile.measuredColors);
}

export function buildGridPrintRecipe(grid: PrintableGrid): PrintRecipe {
  return recipeFromValues(
    grid.settings.baseThicknessMm,
    grid.materials,
    grid.mode === 'layered' ? grid.stopLevels : [],
    grid.materialProfile.measuredColors,
  );
}

function recipeFromValues(
  baseThicknessMm: number,
  materials: BeadProject['amsColors'],
  stopLevels: number[],
  measuredColors: BeadProject['materialProfile']['measuredColors'],
): PrintRecipe {
  const slots = materials.map((material, index) => ({ slot: index + 1, ...material }));
  if (stopLevels.length === 0) return { mode: 'solid', baseThicknessMm, layerHeightMm: null, slots, layers: [], stops: [] };
  const maximum = Math.max(STACK_LAYERS_PER_FILAMENT, ...stopLevels);
  const palette = buildStackPalette(materials);
  const counts = new Map<number, number>();
  stopLevels.forEach((level) => counts.set(level, (counts.get(level) ?? 0) + 1));
  return {
    mode: 'layered',
    baseThicknessMm,
    layerHeightMm: STACK_LAYER_HEIGHT_MM,
    slots,
    layers: Array.from({ length: maximum }, (_, index) => {
      const layer = index + 1;
      const slot = Math.min(materials.length, Math.ceil(layer / STACK_LAYERS_PER_FILAMENT));
      return {
        layer,
        slot,
        material: materials[slot - 1].name,
        zStartMm: round(baseThicknessMm + index * STACK_LAYER_HEIGHT_MM),
        zEndMm: round(baseThicknessMm + layer * STACK_LAYER_HEIGHT_MM),
      };
    }),
    stops: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([stopLevel, cells]) => ({
      stopLevel,
      estimatedHex: palette.find((color) => color.stopLevel === stopLevel)?.hex ?? materials[0].hex,
      measuredHex: measuredColors.find((color) => color.stopLevel === stopLevel)?.hex ?? null,
      cells,
    })),
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
