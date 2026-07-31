import { colorDistance, nearestPaletteColor, palette } from './palette';
import type { ConvertOptions, ConvertResult, GenerationStyle, PaletteColor } from './types';

type StyleProfile = {
  sampleSide: number;
  backgroundThreshold: number;
  dominanceThreshold: number;
  candidateTargetRatio: number;
  candidateDistanceFactor: number;
  postStrengthBias: number;
  useAverageFallback: boolean;
};

type SampledCell = {
  samples: Array<[number, number, number]>;
  average: [number, number, number] | null;
  backgroundShare: number;
};

const styleProfiles: Record<GenerationStyle, StyleProfile> = {
  cartoon: {
    sampleSide: 7,
    backgroundThreshold: 0.72,
    dominanceThreshold: 0.34,
    candidateTargetRatio: 0.58,
    candidateDistanceFactor: 1.35,
    postStrengthBias: 1,
    useAverageFallback: false,
  },
  realistic: {
    sampleSide: 5,
    backgroundThreshold: 0.58,
    dominanceThreshold: 0.26,
    candidateTargetRatio: 0.95,
    candidateDistanceFactor: 0.65,
    postStrengthBias: -1,
    useAverageFallback: true,
  },
};

export async function imageFileToBeads(file: File, options: ConvertOptions): Promise<ConvertResult> {
  const image = await loadImage(file);
  const width = Math.max(1, Math.round(options.width));
  const height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * width));
  const sourceWidth = Math.max(1, image.naturalWidth);
  const sourceHeight = Math.max(1, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is not available.');
  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  const data = context.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const activePalette = options.palette ?? palette;
  const profile = styleProfiles[options.generationStyle ?? 'cartoon'];
  const requestedSpeckleStrength = options.speckleReduction ?? 0;
  const speckleStrength = requestedSpeckleStrength > 0 ? clampStrength(requestedSpeckleStrength + profile.postStrengthBias) : 0;
  const backgroundColor = estimateBackgroundColor(data, sourceWidth, sourceHeight);
  const sampledCells = sampleGridCells(data, sourceWidth, sourceHeight, width, height, options, backgroundColor, profile, speckleStrength);
  const ranked = rankPaletteColors(sampledCells, options, activePalette, profile);
  const candidates = selectCandidateColors(ranked, Math.max(2, options.maxColors), activePalette, speckleStrength, profile);
  const cells = sampledCells.map((cell) => chooseCellColor(cell, candidates, profile));

  const mergedCells = mergeSimilarColors(cells, speckleStrength, candidates);
  const compactCells = reduceTinyRegions(mergedCells, width, height, speckleStrength, candidates);
  const reducedCells = reduceSpeckles(compactCells, width, height, speckleStrength, candidates);
  const colorsUsed = new Set(reducedCells.filter(Boolean)).size;
  const totalBeads = reducedCells.filter(Boolean).length;
  return { width, height, cells: reducedCells, colorsUsed, totalBeads };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load this image.'));
    };
    image.src = url;
  });
}

function sampleGridCells(
  data: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  options: ConvertOptions,
  detectedBackgroundColor: [number, number, number],
  profile: StyleProfile,
  speckleStrength: number,
): SampledCell[] {
  const cells: SampledCell[] = [];
  const totalSamples = profile.sampleSide * profile.sampleSide;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const samples: Array<[number, number, number]> = [];
      let backgroundCount = 0;
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < profile.sampleSide; sy += 1) {
        for (let sx = 0; sx < profile.sampleSide; sx += 1) {
          const sourceX = Math.min(
            sourceWidth - 1,
            Math.max(0, Math.floor(((x + (sx + 0.5) / profile.sampleSide) / width) * sourceWidth)),
          );
          const sourceY = Math.min(
            sourceHeight - 1,
            Math.max(0, Math.floor(((y + (sy + 0.5) / profile.sampleSide) / height) * sourceHeight)),
          );
          const index = (sourceY * sourceWidth + sourceX) * 4;
          const alpha = data[index + 3];
          const rgb: [number, number, number] = [data[index], data[index + 1], data[index + 2]];
          if (isBackgroundSample(alpha, rgb, options, detectedBackgroundColor)) {
            backgroundCount += 1;
            continue;
          }
          const simplified = simplifySourceRgb(rgb, speckleStrength);
          samples.push(simplified);
          r += simplified[0];
          g += simplified[1];
          b += simplified[2];
        }
      }

      cells.push({
        samples,
        average:
          samples.length > 0
            ? [Math.round(r / samples.length), Math.round(g / samples.length), Math.round(b / samples.length)]
            : null,
        backgroundShare: backgroundCount / totalSamples,
      });
    }
  }
  return cells;
}

function rankPaletteColors(
  sampledCells: SampledCell[],
  options: ConvertOptions,
  activePalette: PaletteColor[],
  profile: StyleProfile,
): Array<{ color: PaletteColor; count: number; score: number }> {
  const counts = new Map<string, { color: PaletteColor; count: number }>();
  let total = 0;
  sampledCells.forEach((cell) => {
    if (cell.backgroundShare >= profile.backgroundThreshold || cell.samples.length === 0) return;
    cell.samples.forEach((rgb) => {
      total += 1;
      const color = nearestPaletteColor(rgb, activePalette);
      const bucket = counts.get(color.id) ?? { color, count: 0 };
      bucket.count += 1;
      counts.set(color.id, bucket);
    });
  });
  const rows = [...counts.values()]
    .map((entry) => {
      const chroma = colorChroma(entry.color.rgb);
      const share = total > 0 ? entry.count / total : 0;
      const lightness = luminance(entry.color.rgb);
      const accentBoost = chroma > 48 ? 2.25 : chroma > 28 ? 1.4 : 1;
      const minorityAccentBoost = chroma > 58 && share < 0.018 ? 2.45 : 1;
      const darkLineBoost = lightness < 48 ? 1.55 : 1;
      const lightNeutralPenalty = lightness > 210 && chroma < 22 ? 0.82 : 1;
      return {
        ...entry,
        score: entry.count * accentBoost * minorityAccentBoost * darkLineBoost * lightNeutralPenalty,
      };
    })
    .sort((a, b) => b.score - a.score || b.count - a.count);
  return rows.length > 0
    ? rows
    : activePalette.slice(0, options.maxColors).map((color) => ({ color, count: 1, score: 1 }));
}

function selectCandidateColors(
  ranked: Array<{ color: PaletteColor; count: number; score: number }>,
  maxColors: number,
  activePalette: PaletteColor[],
  strength: number,
  profile: StyleProfile,
): PaletteColor[] {
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  const selected: PaletteColor[] = [];
  const selectedIds = new Set<string>();
  const add = (color: PaletteColor, allowSimilar = false) => {
    if (selectedIds.has(color.id) || selected.length >= maxColors) return false;
    if (!allowSimilar && selected.length > 0) {
      const chroma = colorChroma(color.rgb);
      const baseThreshold = luminance(color.rgb) < 48 || chroma > 58 ? 18 : 34;
      const threshold = (baseThreshold + level * (chroma > 58 ? 3 : 7)) * profile.candidateDistanceFactor;
      const nearestDistance = Math.min(...selected.map((item) => colorDistance(color.rgb, item.rgb)));
      if (nearestDistance < threshold) return false;
    }
    selected.push(color);
    selectedIds.add(color.id);
    return true;
  };

  const chooseDiverseUntil = (targetCount: number) => {
    while (selected.length < Math.min(maxColors, targetCount)) {
      const choices = ranked
        .filter((entry) => !selectedIds.has(entry.color.id))
        .map((entry) => ({
          entry,
          diversityScore: candidateDiversityScore(entry, selected),
        }))
        .sort((a, b) => b.diversityScore - a.diversityScore);
      const added = choices.some((choice) => add(choice.entry.color));
      if (!added) break;
    }
  };

  const sortedByCount = [...ranked].sort((a, b) => b.count - a.count);
  sortedByCount.forEach((entry) => {
    if (selected.length < Math.ceil(maxColors * 0.28)) add(entry.color);
  });

  const protectedFeatureSlots = Math.max(2, Math.ceil(maxColors * (profile.useAverageFallback ? 0.28 : 0.22)));
  const featureCandidates = ranked
    .filter((entry) => isFeatureColor(entry.color, entry.count, ranked))
    .map((entry) => ({
      entry,
      featureScore: featureColorScore(entry, selected),
    }))
    .sort((a, b) => b.featureScore - a.featureScore);

  featureCandidates.forEach((choice) => {
    if (selected.length < maxColors && selected.filter((color) => isFeaturePaletteColor(color)).length < protectedFeatureSlots) {
      add(choice.entry.color, shouldAllowFeatureSimilarity(choice.entry.color, selected));
    }
  });

  ranked
    .filter((entry) => isFeaturePaletteColor(entry.color))
    .forEach((entry) => add(entry.color, shouldAllowFeatureSimilarity(entry.color, selected)));
  chooseDiverseUntil(Math.ceil(maxColors * profile.candidateTargetRatio));
  ranked.forEach((entry) => add(entry.color));
  if (profile.useAverageFallback || selected.length < Math.min(6, maxColors)) {
    ranked.forEach((entry) => add(entry.color, true));
  }

  return selected.length > 0 ? selected : activePalette.slice(0, maxColors);
}

function isFeatureColor(
  color: PaletteColor,
  count: number,
  ranked: Array<{ color: PaletteColor; count: number; score: number }>,
): boolean {
  const maxCount = Math.max(1, ranked[0]?.count ?? 1);
  const shareOfLargest = count / maxCount;
  const chroma = colorChroma(color.rgb);
  const lightness = luminance(color.rgb);
  if (chroma > 70 && shareOfLargest > 0.002) return true;
  if (chroma > 52 && shareOfLargest > 0.006) return true;
  if (lightness < 36 && shareOfLargest > 0.003) return true;
  return false;
}

function isFeaturePaletteColor(color: PaletteColor): boolean {
  return colorChroma(color.rgb) > 48 || luminance(color.rgb) < 45;
}

function shouldAllowFeatureSimilarity(color: PaletteColor, selected: PaletteColor[]): boolean {
  if (selected.length === 0) return false;
  const nearestDistance = Math.min(...selected.map((item) => colorDistance(color.rgb, item.rgb)));
  const chroma = colorChroma(color.rgb);
  return chroma > 68 && nearestDistance > 14;
}

function featureColorScore(
  entry: { color: PaletteColor; count: number; score: number },
  selected: PaletteColor[],
): number {
  const chroma = colorChroma(entry.color.rgb);
  const lightness = luminance(entry.color.rgb);
  const selectedDistance = selected.length > 0 ? Math.min(...selected.map((color) => colorDistance(entry.color.rgb, color.rgb))) : 90;
  const saturationBoost = 1 + Math.min(3.2, chroma / 34);
  const contrastBoost = lightness < 42 ? 1.8 : 1;
  const differenceBoost = Math.max(0.8, Math.min(4.5, selectedDistance / 22));
  return Math.sqrt(Math.max(1, entry.count)) * saturationBoost * contrastBoost * differenceBoost;
}

function candidateDiversityScore(
  entry: { color: PaletteColor; count: number; score: number },
  selected: PaletteColor[],
): number {
  if (selected.length === 0) return entry.score;
  const distance = Math.min(...selected.map((color) => colorDistance(entry.color.rgb, color.rgb)));
  const chroma = colorChroma(entry.color.rgb);
  const lightness = luminance(entry.color.rgb);
  const distinctBoost = Math.max(0.35, Math.min(5.4, (distance / 26) ** 1.55));
  const featureBoost = chroma > 58 || lightness < 48 ? 2.15 : chroma > 34 ? 1.36 : 1;
  const countSignal = Math.sqrt(Math.max(1, entry.count));
  return countSignal * distinctBoost * featureBoost;
}

function chooseCellColor(cell: SampledCell, candidates: PaletteColor[], profile: StyleProfile): string | null {
  if (cell.backgroundShare >= profile.backgroundThreshold || cell.samples.length === 0) return null;
  const counts = new Map<string, { color: PaletteColor; count: number }>();
  cell.samples.forEach((rgb) => {
    const color = nearestPaletteColor(rgb, candidates);
    const bucket = counts.get(color.id) ?? { color, count: 0 };
    bucket.count += 1;
    counts.set(color.id, bucket);
  });
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  const primary = ranked[0];
  if (!primary) return null;
  const primaryShare = primary.count / cell.samples.length;
  if (primaryShare >= profile.dominanceThreshold || !profile.useAverageFallback || !cell.average) {
    return primary.color.id;
  }
  return nearestPaletteColor(cell.average, candidates).id;
}

function reduceSpeckles(
  cells: Array<string | null>,
  width: number,
  height: number,
  strength: number,
  candidates: PaletteColor[],
): Array<string | null> {
  const iterations = Math.max(0, Math.min(4, Math.round(strength)));
  if (iterations === 0) return cells;
  const colorMap = new Map(candidates.map((color) => [color.id, color]));
  let next = cells.slice();
  for (let pass = 0; pass < iterations; pass += 1) {
    const current = next;
    next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const colorId = current[index];
        if (!colorId) continue;
        const neighbors = neighborColorIds(current, width, height, x, y);
        const sameCount = neighbors.filter((item) => item === colorId).length;
        const majority = majorityColor(neighbors);
        if (!majority.colorId) continue;
        if (!areSimilarColors(colorMap.get(colorId), colorMap.get(majority.colorId), strength, false)) continue;
        const requiredMajority = iterations >= 4 ? (pass === 0 ? 3 : 4) : pass === 0 ? 4 : 5;
        const sameLimit = iterations >= 4 ? (pass === 0 ? 2 : 1) : pass === 0 ? 1 : 0;
        if (sameCount <= sameLimit && majority.count >= requiredMajority) {
          next[index] = majority.colorId;
        }
      }
    }
  }
  return next;
}

function reduceTinyRegions(
  cells: Array<string | null>,
  width: number,
  height: number,
  strength: number,
  candidates: PaletteColor[],
): Array<string | null> {
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  const maxRegionSize = [0, 1, 2, 5, 9][level];
  if (maxRegionSize <= 0) return cells;
  const colorMap = new Map(candidates.map((color) => [color.id, color]));
  const next = cells.slice();
  const visited = new Uint8Array(cells.length);
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  for (let start = 0; start < cells.length; start += 1) {
    const colorId = cells[start];
    if (!colorId || visited[start]) continue;
    const region: number[] = [];
    const borderCounts = new Map<string, number>();
    const queue = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      region.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      offsets.forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const neighborIndex = ny * width + nx;
        const neighborColorId = cells[neighborIndex];
        if (neighborColorId === colorId && !visited[neighborIndex]) {
          visited[neighborIndex] = 1;
          queue.push(neighborIndex);
          return;
        }
        if (neighborColorId && neighborColorId !== colorId) {
          borderCounts.set(neighborColorId, (borderCounts.get(neighborColorId) ?? 0) + 1);
        }
      });
    }

    if (region.length > maxRegionSize || borderCounts.size === 0) continue;
    const replacement = [...borderCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .find(([neighborColorId]) =>
        areSimilarColors(colorMap.get(colorId), colorMap.get(neighborColorId), strength, true),
      )?.[0];
    if (!replacement) continue;
    region.forEach((index) => {
      next[index] = replacement;
    });
  }

  return next;
}

function mergeSimilarColors(
  cells: Array<string | null>,
  strength: number,
  candidates: PaletteColor[],
): Array<string | null> {
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  if (level === 0) return cells;
  const colorMap = new Map(candidates.map((color) => [color.id, color]));
  const counts = new Map<string, number>();
  cells.forEach((colorId) => {
    if (!colorId) return;
    counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
  });
  const rows = [...counts.entries()]
    .flatMap(([colorId, count]) => {
      const color = colorMap.get(colorId);
      return color ? [{ colorId, color, count }] : [];
    })
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const replacements = new Map<string, string>();

  rows.forEach((row, index) => {
    const rare = row.count <= Math.max(3, total * (0.006 + level * 0.003));
    const target = rows.slice(0, index).find((candidate) =>
      areSimilarColors(row.color, candidate.color, level, rare),
    );
    if (target) replacements.set(row.colorId, replacements.get(target.colorId) ?? target.colorId);
  });

  if (replacements.size === 0) return cells;
  return cells.map((colorId) => (colorId ? replacements.get(colorId) ?? colorId : null));
}

function areSimilarColors(
  from: PaletteColor | undefined,
  to: PaletteColor | undefined,
  strength: number,
  rare: boolean,
): boolean {
  if (!from || !to || from.id === to.id) return false;
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  const baseThreshold = [0, 26, 42, 62, 84][level];
  if (baseThreshold <= 0) return false;
  const fromChroma = colorChroma(from.rgb);
  const toChroma = colorChroma(to.rgb);
  const fromLuminance = luminance(from.rgb);
  const toLuminance = luminance(to.rgb);
  const distance = colorDistance(from.rgb, to.rgb);
  const saturationMismatch = Math.abs(fromChroma - toChroma);
  const luminanceMismatch = Math.abs(fromLuminance - toLuminance);
  const bothDark = fromLuminance < 84 && toLuminance < 84;
  const bothLightNeutral = fromLuminance > 188 && toLuminance > 188 && fromChroma < 46 && toChroma < 46;
  const bothMuted = fromLuminance > 96 && toLuminance > 96 && fromChroma < 82 && toChroma < 82;
  let threshold = baseThreshold * (rare ? 1.45 : 1);
  if (bothDark || bothLightNeutral || bothMuted) threshold *= 1.15;
  if (fromChroma > 78 || toChroma > 78) threshold *= 0.7;
  if (saturationMismatch > 56) threshold *= 0.58;
  if (luminanceMismatch > 86 && !bothDark) threshold *= 0.55;
  return distance <= threshold;
}

function neighborColorIds(cells: Array<string | null>, width: number, height: number, x: number, y: number): Array<string | null> {
  const result: Array<string | null> = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      result.push(cells[ny * width + nx]);
    }
  }
  return result;
}

function majorityColor(colors: Array<string | null>): { colorId: string | null; count: number } {
  const counts = new Map<string, number>();
  colors.forEach((colorId) => {
    if (!colorId) return;
    counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([colorId, count]) => ({ colorId, count }))
    .sort((a, b) => b.count - a.count)[0] ?? { colorId: null, count: 0 };
}

function isBackgroundSample(
  alpha: number,
  rgb: [number, number, number],
  options: ConvertOptions,
  detectedBackgroundColor: [number, number, number],
): boolean {
  if (alpha < 24) return true;
  if (options.backgroundMode === 'keep') return false;
  const distance = Math.sqrt(
    (rgb[0] - detectedBackgroundColor[0]) ** 2 +
      (rgb[1] - detectedBackgroundColor[1]) ** 2 +
      (rgb[2] - detectedBackgroundColor[2]) ** 2,
  );
  return distance <= options.tolerance;
}

function luminance(rgb: [number, number, number]): number {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function colorChroma(rgb: [number, number, number]): number {
  return Math.max(...rgb) - Math.min(...rgb);
}

function simplifySourceRgb(rgb: [number, number, number], strength: number): [number, number, number] {
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  if (level === 0) return rgb;
  const channelStep = [1, 5, 9, 14, 20][level];
  const neutralThreshold = [0, 8, 14, 20, 28][level];
  const chroma = colorChroma(rgb);
  if (chroma <= neutralThreshold) {
    const value = quantizeChannel(luminance(rgb), channelStep);
    return [value, value, value];
  }
  return [
    quantizeChannel(rgb[0], channelStep),
    quantizeChannel(rgb[1], channelStep),
    quantizeChannel(rgb[2], channelStep),
  ];
}

function quantizeChannel(value: number, step: number): number {
  return Math.max(0, Math.min(255, Math.round(value / step) * step));
}

function clampStrength(value: number): number {
  return Math.max(0, Math.min(4, Math.round(value)));
}

function estimateBackgroundColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const samples: Array<[number, number, number]> = [];
  const maxSamplesPerEdge = 80;
  const xStep = Math.max(1, Math.floor(width / maxSamplesPerEdge));
  const yStep = Math.max(1, Math.floor(height / maxSamplesPerEdge));

  for (let x = 0; x < width; x += xStep) {
    pushOpaqueSample(samples, data, width, x, 0);
    pushOpaqueSample(samples, data, width, x, height - 1);
  }
  for (let y = 0; y < height; y += yStep) {
    pushOpaqueSample(samples, data, width, 0, y);
    pushOpaqueSample(samples, data, width, width - 1, y);
  }

  if (samples.length === 0) return [255, 255, 255];

  const buckets = new Map<string, { rgb: [number, number, number]; count: number }>();
  samples.forEach((rgb) => {
    const key = rgb.map((channel) => Math.round(channel / 16) * 16).join(',');
    const bucket = buckets.get(key) ?? { rgb: [0, 0, 0], count: 0 };
    bucket.rgb[0] += rgb[0];
    bucket.rgb[1] += rgb[1];
    bucket.rgb[2] += rgb[2];
    bucket.count += 1;
    buckets.set(key, bucket);
  });

  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  return [
    Math.round(best.rgb[0] / best.count),
    Math.round(best.rgb[1] / best.count),
    Math.round(best.rgb[2] / best.count),
  ];
}

function pushOpaqueSample(
  samples: Array<[number, number, number]>,
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): void {
  const index = (y * width + x) * 4;
  if (data[index + 3] < 24) return;
  samples.push([data[index], data[index + 1], data[index + 2]]);
}
