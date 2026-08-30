import { colorDistance, getColor, nearestPaletteColor } from "./palette.js";

export type LayerEffect = 'invert' | 'grayscale' | 'blackWhite';
export type AdjustmentSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  hue: number;
};

export const defaultAdjustments: AdjustmentSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  hue: 0,
};


export function hasAdjustments(adjustments: AdjustmentSettings): boolean {
  return (
    adjustments.brightness !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.saturation !== 0 ||
    adjustments.temperature !== 0 ||
    adjustments.hue !== 0
  );
}

export function adjustLayerCells(
  cells: Array<string | null>,
  adjustments: AdjustmentSettings,
  activePalette: NonNullable<ReturnType<typeof getColor>>[],
): Array<string | null> {
  if (!hasAdjustments(adjustments)) return cells;
  const cache = new Map<string, string>();
  return cells.map((colorId) => {
    if (!colorId) return null;
    const cached = cache.get(colorId);
    if (cached) return cached;
    const color = getColor(colorId);
    if (!color) return colorId;
    const adjustedRgb = adjustRgb(color.rgb, adjustments);
    const mapped = nearestPaletteColor(adjustedRgb, activePalette);
    cache.set(colorId, mapped.id);
    return mapped.id;
  });
}

export function adjustRgb(rgb: [number, number, number], adjustments: AdjustmentSettings): [number, number, number] {
  const contrastValue = adjustments.contrast * 2.55;
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const warmed: [number, number, number] = [
    clampByte(rgb[0] + adjustments.temperature * 1.35),
    clampByte(rgb[1] + adjustments.temperature * 0.28),
    clampByte(rgb[2] - adjustments.temperature * 1.35),
  ];
  const contrasted = warmed.map((channel) => clampByte(contrastFactor * (channel - 128) + 128 + adjustments.brightness * 2.55)) as [number, number, number];
  const hsl = rgbToHsl(contrasted);
  hsl.h = (hsl.h + adjustments.hue + 360) % 360;
  hsl.s = Math.max(0, Math.min(1, hsl.s * (1 + adjustments.saturation / 100)));
  return hslToRgb(hsl.h, hsl.s, hsl.l);
}

export function mergeCloseLayerColors(
  cells: Array<string | null>,
  activePalette: NonNullable<ReturnType<typeof getColor>>[],
  strength: number,
): { cells: Array<string | null>; changed: number } {
  const stats = collectLayerColorStats(cells, activePalette);
  if (stats.length < 2) return { cells, changed: 0 };
  const level = Math.max(1, Math.min(4, Math.round(strength)));
  const replacements = new Map<string, string>();
  const sorted = [...stats].sort((a, b) => a.count - b.count);
  sorted.forEach((source) => {
    const target = stats
      .filter((candidate) => candidate.id !== source.id && candidate.count >= source.count)
      .map((candidate) => ({
        candidate,
        distance: colorDistance(source.color.rgb, candidate.color.rgb),
      }))
      .filter((item) => areLayerColorsClose(source.color, item.candidate.color, level))
      .sort((a, b) => {
        const aScore = a.distance - Math.min(18, Math.log2(a.candidate.count + 1) * 2.2);
        const bScore = b.distance - Math.min(18, Math.log2(b.candidate.count + 1) * 2.2);
        return aScore - bScore;
      })[0]?.candidate;
    if (target) replacements.set(source.id, replacements.get(target.id) ?? target.id);
  });
  if (replacements.size === 0) return { cells, changed: 0 };
  let changed = 0;
  const next = cells.map((colorId) => {
    if (!colorId) return null;
    const replacement = replacements.get(colorId);
    if (!replacement || replacement === colorId) return colorId;
    changed += 1;
    return replacement;
  });
  return { cells: next, changed };
}

export function mergeIsolatedLayerColors(
  cells: Array<string | null>,
  width: number,
  height: number,
): { cells: Array<string | null>; changed: number } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || cells.length !== width * height) {
    return { cells, changed: 0 };
  }
  const replacements = new Map<number, string>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = cells[index];
      if (!current) continue;
      const neighbors: string[] = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
          const neighbor = cells[(y + dy) * width + x + dx];
          if (neighbor) neighbors.push(neighbor);
        }
      }
      if (!neighbors.length || neighbors.includes(current)) continue;
      const counts = new Map<string, number>();
      neighbors.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
      const winner = [...counts].sort((left, right) => right[1] - left[1])[0];
      if (winner && winner[1] >= 2) replacements.set(index, winner[0]);
    }
  }
  if (!replacements.size) return { cells, changed: 0 };
  return {
    cells: cells.map((cell, index) => replacements.get(index) ?? cell),
    changed: replacements.size,
  };
}

function areLayerColorsClose(
  from: NonNullable<ReturnType<typeof getColor>>,
  to: NonNullable<ReturnType<typeof getColor>>,
  strength: number,
): boolean {
  const level = Math.max(1, Math.min(4, Math.round(strength)));
  const fromChroma = rgbChroma(from.rgb);
  const toChroma = rgbChroma(to.rgb);
  const fromLum = rgbLuminance(from.rgb);
  const toLum = rgbLuminance(to.rgb);
  const fromHsl = rgbToHsl(from.rgb);
  const toHsl = rgbToHsl(to.rgb);
  const neutral = fromChroma < 34 && toChroma < 34;
  const vivid = fromChroma > 72 || toChroma > 72;
  const luminanceGap = Math.abs(fromLum - toLum);
  const chromaGap = Math.abs(fromChroma - toChroma);
  const hueGap = Math.min(Math.abs(fromHsl.h - toHsl.h), 360 - Math.abs(fromHsl.h - toHsl.h));
  const distance = colorDistance(from.rgb, to.rgb);

  if (neutral) {
    return distance <= [0, 48, 68, 88, 108][level] && luminanceGap <= [0, 30, 44, 60, 76][level];
  }

  if (vivid && hueGap > [0, 12, 18, 28, 38][level]) return false;
  if (chromaGap > [0, 30, 44, 60, 76][level]) return false;
  if (luminanceGap > [0, 34, 50, 68, 84][level]) return false;

  const distanceLimit = vivid ? [0, 34, 50, 66, 82][level] : [0, 44, 64, 84, 104][level];
  if (distance <= distanceLimit) return true;

  return hueGap <= [0, 14, 24, 36, 48][level] && distance <= distanceLimit * 1.18;
}

export function limitLayerColors(
  cells: Array<string | null>,
  activePalette: NonNullable<ReturnType<typeof getColor>>[],
  limit: number,
): { cells: Array<string | null>; changed: number } {
  const targetLimit = Math.max(2, Math.min(48, Math.round(limit)));
  const stats = collectLayerColorStats(cells, activePalette);
  if (stats.length <= targetLimit) return { cells, changed: 0 };
  const kept = selectLayerColorRepresentatives(stats, targetLimit);
  const keptIds = new Set(kept.map((row) => row.id));
  const keptColors = kept.map((row) => row.color);
  let changed = 0;
  const next = cells.map((colorId) => {
    if (!colorId || keptIds.has(colorId)) return colorId;
    const color = getColor(colorId);
    if (!color) return colorId;
    const replacement = nearestPaletteColor(color.rgb, keptColors).id;
    if (replacement !== colorId) changed += 1;
    return replacement;
  });
  return { cells: next, changed };
}

export function applyEffectToLayer(
  cells: Array<string | null>,
  activePalette: NonNullable<ReturnType<typeof getColor>>[],
  effect: LayerEffect,
): { cells: Array<string | null>; changed: number } {
  const cache = new Map<string, string>();
  let changed = 0;
  const next = cells.map((colorId) => {
    if (!colorId) return null;
    const cached = cache.get(colorId);
    if (cached) {
      if (cached !== colorId) changed += 1;
      return cached;
    }
    const color = getColor(colorId);
    if (!color) return colorId;
    const mapped = nearestPaletteColor(effectRgb(color.rgb, effect), activePalette).id;
    cache.set(colorId, mapped);
    if (mapped !== colorId) changed += 1;
    return mapped;
  });
  return { cells: next, changed };
}

function effectRgb(rgb: [number, number, number], effect: LayerEffect): [number, number, number] {
  const luminance = clampByte(rgbLuminance(rgb));
  if (effect === 'invert') return [255 - rgb[0], 255 - rgb[1], 255 - rgb[2]];
  if (effect === 'blackWhite') {
    const value = luminance >= 150 ? 255 : 0;
    return [value, value, value];
  }
  return [luminance, luminance, luminance];
}

function collectLayerColorStats(
  cells: Array<string | null>,
  activePalette: NonNullable<ReturnType<typeof getColor>>[],
): Array<{ id: string; color: NonNullable<ReturnType<typeof getColor>>; count: number }> {
  const paletteIds = new Set(activePalette.map((color) => color.id));
  const counts = new Map<string, number>();
  cells.forEach((colorId) => {
    if (!colorId) return;
    counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
  });
  return [...counts.entries()]
    .flatMap(([id, count]) => {
      const color = getColor(id);
      if (!color) return [];
      const normalized = paletteIds.has(id) ? color : nearestPaletteColor(color.rgb, activePalette);
      return [{ id, color: normalized, count }];
    })
    .sort((a, b) => b.count - a.count);
}

function selectLayerColorRepresentatives(
  stats: Array<{ id: string; color: NonNullable<ReturnType<typeof getColor>>; count: number }>,
  limit: number,
) {
  const kept = [stats[0]];
  const keptIds = new Set([stats[0].id]);
  while (kept.length < limit) {
    const next = stats
      .filter((row) => !keptIds.has(row.id))
      .map((row) => {
        const nearestDistance = Math.min(...kept.map((item) => colorDistance(row.color.rgb, item.color.rgb)));
        const chroma = rgbChroma(row.color.rgb);
        const luminance = rgbLuminance(row.color.rgb);
        const accentBoost = chroma > 70 || luminance < 42 ? 1.8 : chroma > 45 ? 1.25 : 1;
        const score = Math.sqrt(row.count) * Math.max(0.4, nearestDistance / 18) * accentBoost;
        return { row, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.row;
    if (!next) break;
    kept.push(next);
    keptIds.add(next.id);
  }
  return kept;
}

function rgbChroma(rgb: [number, number, number]): number {
  return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
}

function rgbLuminance(rgb: [number, number, number]): number {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHsl([r, g, b]: [number, number, number]): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return { h: hue * 60, s: saturation, l: lightness };
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) {
    const value = clampByte(lightness * 255);
    return [value, value, value];
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const hk = hue / 360;
  const convert = (t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return [clampByte(convert(hk + 1 / 3) * 255), clampByte(convert(hk) * 255), clampByte(convert(hk - 1 / 3) * 255)];
}
