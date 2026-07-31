import { getColor } from './palette';
import type { BeadProject, UsageRow } from './types';

export function summarizeUsage(project: BeadProject): UsageRow[] {
  const usageLayers = (project.layers ?? []).filter((layer) => layer.includeInUsage);
  const counts = new Map<string, number>();
  for (const layer of usageLayers) {
    for (const cell of layer.cells) {
      if (!cell) continue;
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([id, count]) => {
      const color = getColor(id);
      if (!color) return null;
      return {
        color,
        count,
        packs: Math.ceil(count / project.settings.beadsPerPack),
      };
    })
    .filter((row): row is UsageRow => Boolean(row))
    .sort((a, b) => b.count - a.count);
}

export function findIsolatedBeads(project: BeadProject): Array<{ layerId: string; index: number }> {
  const usageLayers = (project.layers ?? []).filter((layer) => layer.includeInUsage);
  const isolated: Array<{ layerId: string; index: number }> = [];
  for (const layer of usageLayers) {
    const cells = layer.cells;
    for (let y = 0; y < project.height; y += 1) {
      for (let x = 0; x < project.width; x += 1) {
        const index = y * project.width + x;
        const id = cells[y * project.width + x];
        if (!id) continue;
        const neighbors = [
          x > 0 ? cells[y * project.width + x - 1] : null,
          x < project.width - 1 ? cells[y * project.width + x + 1] : null,
          y > 0 ? cells[(y - 1) * project.width + x] : null,
          y < project.height - 1 ? cells[(y + 1) * project.width + x] : null,
        ];
        if (!neighbors.some(Boolean)) isolated.push({ layerId: layer.id, index });
      }
    }
  }
  return isolated;
}
