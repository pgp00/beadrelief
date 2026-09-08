import { getColor, paletteVersion } from './palette.js';
import { DEFAULT_ACTIVE_AMS_COLORS, DEFAULT_AMS_COLORS, amsColorToPaletteColor, makeAmsColorId, nearestPaletteColorOklab, normalizeHex } from './print/colors.js';
import { DEFAULT_PRINT_SETTINGS, PRINT_SETTING_LIMITS, normalizeLayeredBaseThickness, normalizePrintSetting, type NumericPrintSetting } from './print/settings.js';
import { STACK_LAYER_HEIGHT_MM, STACK_LAYERS_PER_FILAMENT, STACK_TEMPLATES, buildStackPalette, hasCompleteStackCalibration, parseStackColorId, type StackTemplateId } from './print/stacking.js';
import type { AmsColor, BeadLayer, BeadProject, MaterialProfileMeta, PaletteColor, PrintMode } from './types.js';

export const autosaveKey = 'perler-beads-generator:draft';
export const MAX_PROJECT_DIMENSION = 180;
export const MAX_PROJECT_LAYERS = 64;
export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;

export function normalizeProjectName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) || 'Untitled Pattern' : 'Untitled Pattern';
}

export const DEFAULT_MATERIAL_PROFILE: MaterialProfileMeta = {
  version: '1.0.0',
  name: 'Default example',
  printer: 'Bambu Lab P2S',
  nozzleDiameterMm: 0.4,
  layerHeightMm: 0.08,
  verified: false,
  measuredColors: [],
};

export function createProject(width = 32, height = 32, name = 'Untitled Pattern'): BeadProject {
  const now = new Date().toISOString();
  const cells = emptyCells(width, height);
  return {
    version: '1.0.0',
    name: normalizeProjectName(name),
    width,
    height,
    activeBrand: 'MARD',
    paletteVersion,
    cells,
    layers: [
      {
        id: 'base',
        name: 'Pattern',
        customName: false,
        visible: true,
        locked: false,
        includeInUsage: true,
        opacity: 1,
        cells,
      },
    ],
    activeLayerId: 'base',
    settings: {
      showGrid: true,
      showCoordinates: true,
      showPegboardBoundaries: true,
      showLayerOverlap: false,
      showActiveLayerOnly: false,
      showColorCodes: false,
      beadDisplayMode: 'bead',
      beadsPerPack: 500,
      rightClickAction: 'pan',
    },
    boardSettings: {
      boardWidth: 52,
      boardHeight: 52,
    },
    amsColors: DEFAULT_ACTIVE_AMS_COLORS.map((color) => ({ ...color })),
    materialProfile: { ...DEFAULT_MATERIAL_PROFILE, measuredColors: [] },
    printSettings: { ...DEFAULT_PRINT_SETTINGS, baseColorId: DEFAULT_ACTIVE_AMS_COLORS[0].id },
    createdAt: now,
    updatedAt: now,
  };
}

export function withCells(project: BeadProject, cells: Array<string | null>, width = project.width, height = project.height): BeadProject {
  const normalizedCells = normalizeCells(cells, width, height);
  const layers = normalizeLayers(project, width, height).map((layer) =>
    layer.id === project.activeLayerId && !layer.locked ? { ...layer, cells: normalizedCells } : layer,
  );
  return {
    ...project,
    width,
    height,
    cells: composeVisibleCells(layers, width, height),
    layers,
    updatedAt: new Date().toISOString(),
  };
}

export function createLayer(width: number, height: number, name: string): BeadLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    customName: false,
    visible: true,
    locked: false,
    includeInUsage: true,
    opacity: 1,
    cells: emptyCells(width, height),
  };
}

export function withLayers(project: BeadProject, layers: BeadLayer[], activeLayerId = project.activeLayerId): BeadProject {
  const normalizedLayers = normalizeLayers({ ...project, layers }, project.width, project.height);
  const nextActiveLayerId = normalizedLayers.some((layer) => layer.id === activeLayerId)
    ? activeLayerId
    : normalizedLayers[0]?.id ?? 'base';
  return {
    ...project,
    layers: normalizedLayers,
    activeLayerId: nextActiveLayerId,
    cells: composeVisibleCells(normalizedLayers, project.width, project.height),
    updatedAt: new Date().toISOString(),
  };
}

export function composeVisibleCells(layers: BeadLayer[], width: number, height: number): Array<string | null> {
  const result = emptyCells(width, height);
  for (const layer of layers) {
    if (!layer.visible) continue;
    const cells = normalizeCells(layer.cells, width, height);
    cells.forEach((cell, index) => {
      if (cell) result[index] = cell;
    });
  }
  return result;
}

export function withPrintMode(project: BeadProject, mode: PrintMode): BeadProject {
  return withMaterials(project, project.amsColors, mode);
}

export function withMaterials(project: BeadProject, materials: AmsColor[], mode = project.printSettings.mode): BeadProject {
  if (materials.length < 1 || materials.length > 4 || (mode === 'layered' && materials.length < 2)) {
    throw new Error('A material profile needs one to four filaments; Layered mode needs at least two.');
  }
  const nextMaterials = materials.map((material) => ({ ...material }));
  const palette = mode === 'layered'
    ? buildStackPalette(nextMaterials)
    : nextMaterials.map(amsColorToPaletteColor);
  return remapPrintCells(project, nextMaterials, mode, palette);
}

export function withStackTemplate(project: BeadProject, id: StackTemplateId): BeadProject {
  return withMaterials(project, STACK_TEMPLATES[id], 'layered');
}

function remapPrintCells(
  project: BeadProject,
  materials: AmsColor[],
  mode: PrintMode,
  palette: PaletteColor[],
): BeadProject {
  const solidSlotIds = mode === 'solid' && project.printSettings.mode === 'solid'
    ? new Map(project.amsColors.map((material, index) => [material.id, materials[index]?.id ?? materials[0].id]))
    : null;
  const calibrationChanged = materials.length !== project.amsColors.length || materials.some((material, index) => {
    const previous = project.amsColors[index];
    return !previous || material.hex.toLowerCase() !== previous.hex.toLowerCase() || material.tdMm !== previous.tdMm;
  }) || (mode === 'layered' && project.materialProfile.layerHeightMm !== STACK_LAYER_HEIGHT_MM);
  const byLevel = new Map(palette.flatMap((color) => {
    const parsed = parseStackColorId(color.id);
    return parsed ? [[parsed.stopLevel, color.id] as const] : [];
  }));
  const remap = (id: string | null): string | null => {
    if (!id) return null;
    const slotId = solidSlotIds?.get(id);
    if (slotId) return slotId;
    const parsed = parseStackColorId(id);
    if (mode === 'layered' && parsed) {
      return byLevel.get(Math.min(parsed.stopLevel, materials.length * STACK_LAYERS_PER_FILAMENT)) ?? palette[0].id;
    }
    const source = getColor(id);
    return source ? nearestPaletteColorOklab(source.hex, palette).id : palette[0].id;
  };
  const layers = project.layers.map((layer) => ({ ...layer, cells: layer.cells.map(remap) }));
  return {
    ...project,
    amsColors: materials,
    materialProfile: calibrationChanged ? {
      ...project.materialProfile,
      layerHeightMm: mode === 'layered' ? STACK_LAYER_HEIGHT_MM : project.materialProfile.layerHeightMm,
      verified: false,
      measuredColors: [],
    } : project.materialProfile,
    printSettings: {
      ...project.printSettings,
      mode,
      baseColorId: solidSlotIds?.get(project.printSettings.baseColorId) ?? materials[0].id,
    },
    layers,
    cells: composeVisibleCells(layers, project.width, project.height),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeProject(project: unknown): BeadProject {
  const source = isRecord(project) ? project : {};
  const width = isSafeDimension(source.width) ? source.width : 32;
  const height = isSafeDimension(source.height) ? source.height : 32;
  const name = normalizeProjectName(source.name);
  const fallback = createProject(width, height, name);
  const amsColors = normalizeAmsColors(source.amsColors);
  const importedAmsIds = importedAmsIdMap(source.amsColors, amsColors);
  const importedPrintSettings = isRecord(source.printSettings) ? source.printSettings : {};
  const cellPitchMm = normalizePrintSetting('cellPitchMm', importedPrintSettings.cellPitchMm);
  let baseThicknessMm = normalizePrintSetting('baseThicknessMm', importedPrintSettings.baseThicknessMm);
  const beadHeightMm = normalizePrintSetting('beadHeightMm', importedPrintSettings.beadHeightMm);
  const dimpleDiameterMm = Math.min(
    normalizePrintSetting('dimpleDiameterMm', importedPrintSettings.dimpleDiameterMm),
    cellPitchMm - 0.2,
  );
  const dimpleDepthMm = Math.min(
    normalizePrintSetting('dimpleDepthMm', importedPrintSettings.dimpleDepthMm),
    beadHeightMm - 0.2,
  );
  const borderWidthMm = normalizePrintSetting('borderWidthMm', importedPrintSettings.borderWidthMm);
  const hangingHoleDiameterMm = normalizePrintSetting('hangingHoleDiameterMm', importedPrintSettings.hangingHoleDiameterMm);
  const mode = importedPrintSettings.mode === 'layered' && amsColors.length >= 2 ? 'layered' : 'solid';
  if (mode === 'layered') baseThicknessMm = normalizeLayeredBaseThickness(importedPrintSettings.baseThicknessMm);
  const importedBase = typeof importedPrintSettings.baseColorId === 'string' ? importedPrintSettings.baseColorId : '';
  const requestedBase = importedAmsIds.get(importedBase) ?? importedBase;
  const requestedSlot = Number(/^ams-([1-4])-/.exec(requestedBase)?.[1]);
  const baseColorId =
    amsColors.find((color) => color.id === requestedBase)?.id ??
    amsColors[requestedSlot - 1]?.id ??
    amsColors[0].id;
  const importedSettings = isRecord(source.settings) ? source.settings : {};
  const settings: BeadProject['settings'] = {
    showGrid: booleanOr(importedSettings.showGrid, fallback.settings.showGrid),
    showCoordinates: booleanOr(importedSettings.showCoordinates, fallback.settings.showCoordinates),
    showPegboardBoundaries: booleanOr(importedSettings.showPegboardBoundaries, fallback.settings.showPegboardBoundaries),
    showLayerOverlap: booleanOr(importedSettings.showLayerOverlap, fallback.settings.showLayerOverlap),
    showActiveLayerOnly: booleanOr(importedSettings.showActiveLayerOnly, fallback.settings.showActiveLayerOnly),
    showColorCodes: booleanOr(importedSettings.showColorCodes, fallback.settings.showColorCodes) || importedSettings.beadDisplayMode === 'print',
    beadDisplayMode: importedSettings.beadDisplayMode === 'pixel' ? 'pixel' : 'bead',
    beadsPerPack: safeIntegerInRange(importedSettings.beadsPerPack, fallback.settings.beadsPerPack, 1, 10000),
    rightClickAction: importedSettings.rightClickAction === 'erase' ? 'erase' : 'pan',
  } satisfies BeadProject['settings'];
  const importedBoardSettings = isRecord(source.boardSettings) ? source.boardSettings : {};
  const boardSettings: BeadProject['boardSettings'] = {
    boardWidth: safeIntegerInRange(importedBoardSettings.boardWidth, fallback.boardSettings.boardWidth, 1, 1000),
    boardHeight: safeIntegerInRange(importedBoardSettings.boardHeight, fallback.boardSettings.boardHeight, 1, 1000),
  };
  const materialProfile = normalizeMaterialProfileMeta(source.materialProfile, amsColors.length);
  const layers = normalizeLayers(source, width, height).map((layer) => ({
    ...layer,
    cells: layer.cells.map((cell) => cell ? importedAmsIds.get(cell) ?? cell : null),
  }));
  const requestedActiveLayerId = typeof source.activeLayerId === 'string' ? source.activeLayerId : '';
  const normalized: BeadProject = {
    version: typeof source.version === 'string' ? source.version : fallback.version,
    name,
    width,
    height,
    activeBrand: 'MARD',
    paletteVersion,
    settings,
    boardSettings,
    amsColors,
    materialProfile,
    printSettings: {
      cellPitchMm,
      baseThicknessMm,
      beadHeightMm,
      dimpleDiameterMm,
      dimpleDepthMm,
      baseColorId,
      mode,
      borderWidthMm,
      separateBase: booleanOr(importedPrintSettings.separateBase, false),
      hangingHoleDiameterMm,
      backText: typeof importedPrintSettings.backText === 'string'
        ? importedPrintSettings.backText.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 12)
        : '',
    },
    layers,
    activeLayerId: layers.some((layer) => layer.id === requestedActiveLayerId) ? requestedActiveLayerId : layers[0].id,
    cells: composeVisibleCells(layers, width, height),
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : fallback.createdAt,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : fallback.updatedAt,
  };
  return mode === 'layered'
    ? remapPrintCells(normalized, amsColors, mode, buildStackPalette(amsColors))
    : normalized;
}

function normalizeAmsColors(colors: unknown): AmsColor[] {
  const source = Array.isArray(colors) && colors.length ? colors.slice(0, 4) : DEFAULT_ACTIVE_AMS_COLORS;
  return source.map((color, index) => {
    const candidate = isRecord(color) ? color : {};
    const fallback = DEFAULT_AMS_COLORS[index] ?? DEFAULT_AMS_COLORS[0];
    let hex: string;
    try {
      hex = normalizeHex(typeof candidate.hex === 'string' ? candidate.hex : fallback.hex);
    } catch {
      hex = fallback.hex;
    }
    return {
      id: makeAmsColorId(index + 1, hex),
      name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : fallback.name,
      hex,
      tdMm: typeof candidate.tdMm === 'number' && Number.isFinite(candidate.tdMm) && candidate.tdMm > 0 && candidate.tdMm <= 100
        ? candidate.tdMm
        : fallback.tdMm,
    };
  });
}

function normalizeMaterialProfileMeta(value: unknown, materialCount = 1): MaterialProfileMeta {
  if (!isRecord(value)) return { ...DEFAULT_MATERIAL_PROFILE, measuredColors: [] };
  const nozzle = [0.2, 0.4, 0.6, 0.8].includes(Number(value.nozzleDiameterMm))
    ? Number(value.nozzleDiameterMm) as MaterialProfileMeta['nozzleDiameterMm']
    : DEFAULT_MATERIAL_PROFILE.nozzleDiameterMm;
  const normalizedMeasuredColors = Array.isArray(value.measuredColors) ? value.measuredColors.flatMap((item) => {
    if (!isRecord(item) || !Number.isSafeInteger(item.stopLevel) || Number(item.stopLevel) < 4 || Number(item.stopLevel) > 16
      || typeof item.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.hex)) return [];
    return [{ stopLevel: Number(item.stopLevel), hex: item.hex.toLowerCase() }];
  }) : [];
  const measuredColors = [...new Map(normalizedMeasuredColors
    .filter(({ stopLevel }) => stopLevel <= materialCount * 4)
    .map((color) => [color.stopLevel, color])).values()];
  const calibrationComplete = hasCompleteStackCalibration(materialCount, measuredColors);
  return {
    version: '1.0.0',
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 80) : DEFAULT_MATERIAL_PROFILE.name,
    printer: typeof value.printer === 'string' && value.printer.trim() ? value.printer.trim().slice(0, 80) : DEFAULT_MATERIAL_PROFILE.printer,
    nozzleDiameterMm: nozzle,
    layerHeightMm: typeof value.layerHeightMm === 'number' && Number.isFinite(value.layerHeightMm) && value.layerHeightMm >= 0.04 && value.layerHeightMm <= 0.4
      ? value.layerHeightMm
      : DEFAULT_MATERIAL_PROFILE.layerHeightMm,
    verified: value.verified === true && calibrationComplete,
    measuredColors,
  };
}

function importedAmsIdMap(colors: unknown, normalized: AmsColor[]): Map<string, string> {
  const result = new Map<string, string>();
  if (!Array.isArray(colors)) return result;
  colors.slice(0, normalized.length).forEach((value, index) => {
    if (!isRecord(value) || typeof value.id !== 'string' || result.has(value.id)) return;
    result.set(value.id, normalized[index].id);
  });
  return result;
}

function normalizeLayers(project: unknown, width: number, height: number): BeadLayer[] {
  const source = isRecord(project) ? project : {};
  const legacyCells = normalizeCells(source.cells, width, height);
  const sourceLayers = Array.isArray(source.layers) && source.layers.length
    ? source.layers
    : [{ ...createProject(width, height).layers[0], cells: legacyCells }];
  const usedIds = new Set<string>();
  return sourceLayers.slice(0, MAX_PROJECT_LAYERS).map((value, index) => {
    const layer = isRecord(value) ? value : {};
    const requestedId = typeof layer.id === 'string' && layer.id.trim()
      ? layer.id.trim()
      : index === 0 ? 'base' : `layer-${index + 1}`;
    let id = requestedId;
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${requestedId}-${suffix}`;
    usedIds.add(id);
    return {
      id,
      name: typeof layer.name === 'string' && layer.name.trim() ? layer.name : index === 0 ? 'Pattern' : `Layer ${index + 1}`,
      customName: booleanOr(layer.customName, false),
      visible: booleanOr(layer.visible, true),
      locked: booleanOr(layer.locked, false),
      includeInUsage: booleanOr(layer.includeInUsage, true),
      opacity: finiteInRange(layer.opacity, 1, 0, 1),
      cells: normalizeCells(layer.cells ?? (index === 0 ? legacyCells : []), width, height),
    };
  });
}

export function isSafeProjectImport(project: unknown, fileBytes: number): boolean {
  if (!isRecord(project) || !Number.isSafeInteger(fileBytes) || fileBytes < 0 || fileBytes > MAX_PROJECT_FILE_BYTES) return false;
  if (!isSafeDimension(project.width) || !isSafeDimension(project.height)) return false;
  if (!isCellArray(project.cells, project.width * project.height)) return false;
  if (!optionalString(project.version) || !optionalString(project.name)
    || !optionalString(project.createdAt) || !optionalString(project.updatedAt)) return false;
  if (project.amsColors !== undefined && !isSafeAmsColors(project.amsColors)) return false;
  if (project.settings !== undefined && !isSafeProjectSettings(project.settings)) return false;
  if (project.boardSettings !== undefined && !isSafeBoardSettings(project.boardSettings)) return false;
  if (project.printSettings !== undefined && !isSafePrintSettings(project.printSettings)) return false;
  if (project.materialProfile !== undefined && !isSafeMaterialProfileMeta(project.materialProfile)) return false;
  if (isRecord(project.printSettings) && project.printSettings.mode === 'layered'
    && (!Array.isArray(project.amsColors) || project.amsColors.length < 2)) return false;
  if (project.layers === undefined) return project.activeLayerId === undefined || typeof project.activeLayerId === 'string';
  if (!Array.isArray(project.layers) || project.layers.length < 1 || project.layers.length > MAX_PROJECT_LAYERS) return false;
  const ids = new Set<string>();
  for (const layer of project.layers) {
    if (!isSafeLayer(layer, project.width * project.height) || ids.has(layer.id)) return false;
    ids.add(layer.id);
  }
  return project.activeLayerId === undefined
    || (typeof project.activeLayerId === 'string' && ids.has(project.activeLayerId));
}

function isSafeMaterialProfileMeta(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.version !== '1.0.0' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80
    || typeof value.printer !== 'string' || !value.printer.trim() || value.printer.length > 80
    || ![0.2, 0.4, 0.6, 0.8].includes(Number(value.nozzleDiameterMm))
    || typeof value.layerHeightMm !== 'number' || !Number.isFinite(value.layerHeightMm) || value.layerHeightMm < 0.04 || value.layerHeightMm > 0.4
    || typeof value.verified !== 'boolean' || !Array.isArray(value.measuredColors) || value.measuredColors.length > 13) return false;
  return value.measuredColors.every((item) => isRecord(item)
    && Number.isSafeInteger(item.stopLevel) && Number(item.stopLevel) >= 4 && Number(item.stopLevel) <= 16
    && typeof item.hex === 'string' && /^#[0-9a-f]{6}$/i.test(item.hex));
}

function isSafeAmsColors(value: unknown): boolean {
  const ids = new Set<string>();
  return Array.isArray(value) && value.length >= 1 && value.length <= 4 && value.every((item) => {
    if (!isRecord(item)) return false;
    if (typeof item.id !== 'string' || item.id !== item.id.trim() || !item.id || ids.has(item.id)) return false;
    ids.add(item.id);
    return typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 32
      && typeof item.hex === 'string' && /^#[0-9a-f]{6}$/i.test(item.hex)
      && (item.tdMm === undefined || (typeof item.tdMm === 'number' && Number.isFinite(item.tdMm) && item.tdMm > 0 && item.tdMm <= 100));
  });
}

function isSafeProjectSettings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const booleanKeys = [
    'showGrid',
    'showCoordinates',
    'showPegboardBoundaries',
    'showLayerOverlap',
    'showActiveLayerOnly',
    'showColorCodes',
  ];
  if (booleanKeys.some((key) => value[key] !== undefined && typeof value[key] !== 'boolean')) return false;
  if (value.beadDisplayMode !== undefined && !['pixel', 'bead', 'print'].includes(String(value.beadDisplayMode))) return false;
  if (value.rightClickAction !== undefined && value.rightClickAction !== 'pan' && value.rightClickAction !== 'erase') return false;
  return value.beadsPerPack === undefined || isSafeIntegerInRange(value.beadsPerPack, 1, 10000);
}

function isSafeBoardSettings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.boardWidth === undefined || isSafeIntegerInRange(value.boardWidth, 1, 1000))
    && (value.boardHeight === undefined || isSafeIntegerInRange(value.boardHeight, 1, 1000));
}

function isSafePrintSettings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const key of Object.keys(PRINT_SETTING_LIMITS) as NumericPrintSetting[]) {
    const setting = value[key];
    const limits = PRINT_SETTING_LIMITS[key];
    if (setting !== undefined && (typeof setting !== 'number' || !Number.isFinite(setting) || setting < limits.min || setting > limits.max)) {
      return false;
    }
  }
  if (value.baseColorId !== undefined && typeof value.baseColorId !== 'string') return false;
  if (value.mode !== undefined && value.mode !== 'solid' && value.mode !== 'layered') return false;
  if (value.separateBase !== undefined && typeof value.separateBase !== 'boolean') return false;
  if (value.backText !== undefined && (typeof value.backText !== 'string' || value.backText.length > 12 || /[^A-Z0-9 -]/i.test(value.backText))) return false;
  if (typeof value.dimpleDepthMm === 'number' && typeof value.beadHeightMm === 'number'
    && value.dimpleDepthMm >= value.beadHeightMm) return false;
  if (typeof value.dimpleDiameterMm === 'number' && typeof value.cellPitchMm === 'number'
    && value.dimpleDiameterMm >= value.cellPitchMm - 0.1) return false;
  return value.mode !== 'layered' || typeof value.baseThicknessMm !== 'number'
    || Math.abs(value.baseThicknessMm / 0.08 - Math.round(value.baseThicknessMm / 0.08)) < 1e-6;
}

function isSafeLayer(value: unknown, maximumCells: number): value is Record<string, unknown> & { id: string } {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id === value.id.trim() && value.id.length > 0
    && optionalString(value.name)
    && (value.customName === undefined || typeof value.customName === 'boolean')
    && (value.visible === undefined || typeof value.visible === 'boolean')
    && (value.locked === undefined || typeof value.locked === 'boolean')
    && (value.includeInUsage === undefined || typeof value.includeInUsage === 'boolean')
    && (value.opacity === undefined || (typeof value.opacity === 'number' && Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1))
    && isCellArray(value.cells, maximumCells);
}

function isCellArray(value: unknown, maximumLength: number): boolean {
  return Array.isArray(value)
    && value.length <= maximumLength
    && value.every((cell) => cell === null || typeof cell === 'string');
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function finiteInRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function safeIntegerInRange(value: unknown, fallback: number, min: number, max: number): number {
  return isSafeIntegerInRange(value, min, max) ? value : fallback;
}

function isSafeIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function hasEditableWork(project: BeadProject): boolean {
  return project.layers.some((layer) => layer.cells.some((cell) => cell !== null));
}

export function projectGridChanged(previous: BeadProject, next: BeadProject): boolean {
  if (previous.width !== next.width || previous.height !== next.height || previous.layers.length !== next.layers.length) return true;
  return previous.layers.some((layer, index) => {
    const nextLayer = next.layers[index];
    return layer.id !== nextLayer.id
      || layer.cells.length !== nextLayer.cells.length
      || layer.cells.some((cell, cellIndex) => cell !== nextLayer.cells[cellIndex]);
  });
}

function isSafeDimension(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAX_PROJECT_DIMENSION;
}

function normalizeCells(cells: unknown, width: number, height: number): Array<string | null> {
  const length = width * height;
  const source = Array.isArray(cells) ? cells : [];
  const next = Array.from({ length }, (_, index) => typeof source[index] === 'string' ? source[index] : null);
  return next;
}

function emptyCells(width: number, height: number): Array<string | null> {
  return Array.from({ length: width * height }, () => null);
}

export function saveDraft(project: BeadProject): boolean {
  try {
    localStorage.setItem(autosaveKey, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(): BeadProject | null {
  try {
    const raw = localStorage.getItem(autosaveKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BeadProject;
    if (!parsed.width || !parsed.height || !Array.isArray(parsed.cells)) return null;
    return normalizeProject(parsed);
  } catch {
    return null;
  }
}
