import type { PrintExportOptions } from './exporters.js';
import {
  MAX_PROJECT_LAYERS,
  composeVisibleCells,
  createProject,
  hasEditableWork,
  projectGridChanged,
  withCells,
} from './project.js';
import type { BackgroundMode, BeadProject, ConvertResult, GenerationStyle } from './types.js';

export function autoGenerationPaletteKey(mode: BeadProject['printSettings']['mode'], colors: BeadProject['amsColors']): string {
  return mode === 'layered'
    ? 'layered'
    : `solid:${JSON.stringify(colors.map(({ id, hex }) => [id, hex]))}`;
}

export function beginAutoGenerationEffect(request: { current: number }, suppression: { current: boolean }): boolean {
  request.current += 1;
  const shouldGenerate = !suppression.current;
  suppression.current = false;
  return shouldGenerate;
}

export function pendingGenerationAction(pending: boolean, suppressed: boolean): 'none' | 'restart' | 'cancel' {
  return !pending ? 'none' : suppressed ? 'cancel' : 'restart';
}

export function shouldAutoRegenerate(hasSource: boolean, hasManualEdits: boolean): boolean {
  return hasSource && !hasManualEdits;
}

export function hasLayerCapacity(layerCount: number): boolean {
  return layerCount < MAX_PROJECT_LAYERS;
}

export function canEditLayer(layer: Pick<BeadProject['layers'][number], 'locked' | 'visible'>): boolean {
  return !layer.locked && layer.visible;
}

export function resizeWouldCropProject(project: BeadProject, width: number, height: number): boolean {
  if (width >= project.width && height >= project.height) return false;
  return project.layers.some((layer) => layer.cells.some((cell, index) => (
    cell !== null && (index % project.width >= width || Math.floor(index / project.width) >= height)
  )));
}

export function printOptionsForProject(project: BeadProject, options: PrintExportOptions, layerLabelPrefix: string): PrintExportOptions {
  return { ...options, projectName: project.name, layerLabelPrefix };
}

export function generationBlocksExport(running: boolean, scheduled: boolean): boolean {
  return running || scheduled;
}

export function codedUiError(code: string, message: string): string {
  return `[${code}] ${message}`;
}

export function imageLaunchState(hasPendingImage: boolean, project: BeadProject) {
  return {
    showActions: !hasPendingImage && !hasEditableWork(project),
    sampleSettings: {
      width: 10,
      generationStyle: 'cartoon' as GenerationStyle,
      backgroundMode: 'keep' as BackgroundMode,
      tolerance: 0,
    },
  };
}

export async function loadHeartSample(fetchImage: typeof fetch, localizedError: string): Promise<File> {
  try {
    const response = await fetchImage('./samples/beadrelief-heart-source.png');
    if (!response.ok) throw new Error(localizedError);
    return new File([await response.blob()], 'beadrelief-heart-source.png', { type: 'image/png' });
  } catch {
    throw new Error(localizedError);
  }
}

export function replaceGeneratedProject(
  project: BeadProject,
  result: Pick<ConvertResult, 'width' | 'height' | 'cells'>,
): BeadProject {
  const fresh = createProject(result.width, result.height, project.name);
  return withCells({
    ...fresh,
    settings: { ...project.settings, showActiveLayerOnly: false },
    boardSettings: { ...project.boardSettings },
    amsColors: project.amsColors.map((color) => ({ ...color })),
    printSettings: { ...project.printSettings },
  }, result.cells, result.width, result.height);
}

export function projectForDisplay(project: BeadProject): BeadProject {
  if (!project.settings.showActiveLayerOnly) return project;
  const layers = project.layers.map((layer) => ({
    ...layer,
    visible: layer.id === project.activeLayerId,
  }));
  return { ...project, layers, cells: composeVisibleCells(layers, project.width, project.height) };
}

export { projectGridChanged };
