import { getColor, paletteVersion } from './palette';
import { DEFAULT_AMS_COLORS, amsColorToPaletteColor, makeAmsColorId, nearestPaletteColorOklab, normalizeHex } from './print/colors';
import { DEFAULT_PRINT_SETTINGS } from './print/settings';
import { STACK_LAYERS_PER_FILAMENT, STACK_TEMPLATES, buildStackPalette, parseStackColorId, type StackTemplateId } from './print/stacking';
import type { AmsColor, BeadLayer, BeadProject, PaletteColor, PrintMode } from './types';

export const autosaveKey = 'perler-beads-generator:draft';
export const MAX_PROJECT_DIMENSION = 50;
export const MAX_PROJECT_LAYERS = 64;
export const MAX_PROJECT_FILE_BYTES = 20 * 1024 * 1024;

export function createProject(width = 32, height = 32, name = 'Untitled Pattern'): BeadProject {
  const now = new Date().toISOString();
  const cells = emptyCells(width, height);
  return {
    version: '1.0.0',
    name,
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
      showBoardIds: true,
    },
    amsColors: DEFAULT_AMS_COLORS.map((color) => ({ ...color })),
    printSettings: { ...DEFAULT_PRINT_SETTINGS },
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
  if (mode === 'layered' && project.amsColors.length < 2) throw new Error('Layered mode needs two to four filaments.');
  const palette = mode === 'layered'
    ? buildStackPalette(project.amsColors)
    : project.amsColors.map(amsColorToPaletteColor);
  return remapPrintCells(project, project.amsColors, mode, palette);
}

export function withLayeredMaterials(project: BeadProject, materials: AmsColor[]): BeadProject {
  const nextMaterials = materials.map((material) => ({ ...material }));
  return remapPrintCells(project, nextMaterials, 'layered', buildStackPalette(nextMaterials));
}

export function withStackTemplate(project: BeadProject, id: StackTemplateId): BeadProject {
  return withLayeredMaterials(project, STACK_TEMPLATES[id].map((material) => ({ ...material })));
}

function remapPrintCells(
  project: BeadProject,
  materials: AmsColor[],
  mode: PrintMode,
  palette: PaletteColor[],
): BeadProject {
  const byLevel = new Map(palette.flatMap((color) => {
    const parsed = parseStackColorId(color.id);
    return parsed ? [[parsed.stopLevel, color.id] as const] : [];
  }));
  const remap = (id: string | null): string | null => {
    if (!id) return null;
    const parsed = parseStackColorId(id);
    if (mode === 'layered' && parsed) {
      return byLevel.get(Math.min(parsed.stopLevel, materials.length * STACK_LAYERS_PER_FILAMENT)) ?? palette[0].id;
    }
    if (mode === 'layered' && project.printSettings.mode === 'layered') return palette[0].id;
    const source = getColor(id);
    return source ? nearestPaletteColorOklab(source.hex, palette).id : palette[0].id;
  };
  const layers = project.layers.map((layer) => ({ ...layer, cells: layer.cells.map(remap) }));
  return {
    ...project,
    amsColors: materials,
    printSettings: {
      ...project.printSettings,
      mode,
      baseColorId: materials[0].id,
    },
    layers,
    cells: composeVisibleCells(layers, project.width, project.height),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeProject(project: BeadProject): BeadProject {
  const width = isSafeDimension(project.width) ? project.width : 32;
  const height = isSafeDimension(project.height) ? project.height : 32;
  const fallback = createProject(width, height, project.name);
  const amsColors = normalizeAmsColors(project.amsColors);
  const mode = project.printSettings?.mode === 'layered' && amsColors.length >= 2 ? 'layered' : 'solid';
  const requestedBase = project.printSettings?.baseColorId;
  const requestedSlot = Number(/^ams-([1-4])-/.exec(requestedBase ?? '')?.[1]);
  const baseColorId =
    amsColors.find((color) => color.id === requestedBase)?.id ??
    amsColors[requestedSlot - 1]?.id ??
    amsColors[0].id;
  const settings = {
    ...fallback.settings,
    ...project.settings,
    showColorCodes: Boolean(project.settings?.showColorCodes || project.settings?.beadDisplayMode === 'print'),
    beadDisplayMode: project.settings?.beadDisplayMode === 'pixel' ? 'pixel' : 'bead',
  } satisfies BeadProject['settings'];
  const layers = normalizeLayers(
    {
      ...fallback,
      ...project,
      settings,
      boardSettings: { ...fallback.boardSettings, ...project.boardSettings },
      layers: project.layers?.length ? project.layers : fallback.layers,
    },
    width,
    height,
  );
  const normalized: BeadProject = {
    ...fallback,
    ...project,
    width,
    height,
    activeBrand: 'MARD',
    settings,
    boardSettings: { ...fallback.boardSettings, ...project.boardSettings },
    amsColors,
    printSettings: {
      ...DEFAULT_PRINT_SETTINGS,
      ...project.printSettings,
      baseColorId,
      mode,
    },
    layers,
    activeLayerId: layers.some((layer) => layer.id === project.activeLayerId) ? project.activeLayerId : layers[0].id,
    cells: composeVisibleCells(layers, width, height),
  };
  return mode === 'layered'
    ? remapPrintCells(normalized, amsColors, mode, buildStackPalette(amsColors))
    : normalized;
}

function normalizeAmsColors(colors: AmsColor[] | undefined): AmsColor[] {
  const source = colors?.length ? colors.slice(0, 4) : DEFAULT_AMS_COLORS;
  return source.map((color, index) => {
    const fallback = DEFAULT_AMS_COLORS[index] ?? DEFAULT_AMS_COLORS[0];
    let hex: string;
    try {
      hex = normalizeHex(color?.hex ?? fallback.hex);
    } catch {
      hex = fallback.hex;
    }
    return {
      id: makeAmsColorId(index + 1, hex),
      name: color?.name?.trim() || fallback.name,
      hex,
      tdMm: Number.isFinite(color?.tdMm) && color.tdMm > 0 && color.tdMm <= 100 ? color.tdMm : fallback.tdMm,
    };
  });
}

function normalizeLayers(project: BeadProject, width: number, height: number): BeadLayer[] {
  const legacyCells = normalizeCells(project.cells, width, height);
  const sourceLayers = project.layers?.length ? project.layers : createProject(width, height).layers;
  return sourceLayers.slice(0, MAX_PROJECT_LAYERS).map((layer, index) => ({
    ...layer,
    customName: Boolean(layer.customName),
    cells: normalizeCells(layer.cells ?? (index === 0 ? legacyCells : []), width, height),
  }));
}

export function isSafeProjectImport(project: unknown, fileBytes: number): project is BeadProject {
  if (!project || typeof project !== 'object' || fileBytes < 0 || fileBytes > MAX_PROJECT_FILE_BYTES) return false;
  const candidate = project as Partial<BeadProject>;
  return isSafeDimension(candidate.width)
    && isSafeDimension(candidate.height)
    && Array.isArray(candidate.cells)
    && (!candidate.layers || (Array.isArray(candidate.layers) && candidate.layers.length <= MAX_PROJECT_LAYERS));
}

function isSafeDimension(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAX_PROJECT_DIMENSION;
}

function normalizeCells(cells: ReadonlyArray<unknown> | undefined, width: number, height: number): Array<string | null> {
  const length = width * height;
  const next = Array.from({ length }, (_, index) => typeof cells?.[index] === 'string' ? cells[index] : null);
  return next;
}

function emptyCells(width: number, height: number): Array<string | null> {
  return Array.from({ length: width * height }, () => null);
}

export function saveDraft(project: BeadProject): void {
  localStorage.setItem(autosaveKey, JSON.stringify(project));
}

export function loadDraft(): BeadProject | null {
  try {
    const raw = localStorage.getItem(autosaveKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BeadProject;
    if (!parsed.width || !parsed.height || !Array.isArray(parsed.cells)) return null;
    return normalizeProject(parsed);
  } catch {
    localStorage.removeItem(autosaveKey);
    return null;
  }
}
