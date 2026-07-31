import { paletteVersion } from './palette';
import type { BeadLayer, BeadProject } from './types';

export const autosaveKey = 'perler-beads-generator:draft';

export function createProject(width = 52, height = 52, name = 'Untitled Pattern'): BeadProject {
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

export function normalizeProject(project: BeadProject): BeadProject {
  const width = Number.isFinite(project.width) ? project.width : 29;
  const height = Number.isFinite(project.height) ? project.height : 29;
  const fallback = createProject(width, height, project.name);
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
  return {
    ...fallback,
    ...project,
    width,
    height,
    activeBrand: 'MARD',
    settings,
    boardSettings: { ...fallback.boardSettings, ...project.boardSettings },
    layers,
    activeLayerId: layers.some((layer) => layer.id === project.activeLayerId) ? project.activeLayerId : layers[0].id,
    cells: composeVisibleCells(layers, width, height),
  };
}

function normalizeLayers(project: BeadProject, width: number, height: number): BeadLayer[] {
  const legacyCells = normalizeCells(project.cells, width, height);
  const sourceLayers = project.layers?.length ? project.layers : createProject(width, height).layers;
  return sourceLayers.map((layer, index) => ({
    ...layer,
    customName: Boolean(layer.customName),
    cells: normalizeCells(layer.cells ?? (index === 0 ? legacyCells : []), width, height),
  }));
}

function normalizeCells(cells: Array<string | null> | undefined, width: number, height: number): Array<string | null> {
  const length = width * height;
  const next = Array.from({ length }, (_, index) => cells?.[index] ?? null);
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
