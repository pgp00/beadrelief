import type { AmsColor, PaletteColor } from '../types';

export const DEFAULT_AMS_COLORS: AmsColor[] = [
  { id: 'ams-1-1c1c1c', name: 'Black', hex: '#1c1c1c' },
  { id: 'ams-2-f4f1e8', name: 'White', hex: '#f4f1e8' },
  { id: 'ams-3-ed2b2b', name: 'Red', hex: '#ed2b2b' },
  { id: 'ams-4-2864dc', name: 'Blue', hex: '#2864dc' },
];

export function normalizeHex(hex: string): string {
  const value = `#${hex.replace('#', '').toLowerCase()}`;
  if (!/^#[0-9a-f]{6}$/.test(value)) throw new Error(`Invalid color: ${hex}`);
  return value;
}

export function makeAmsColorId(slot: number, hex: string): string {
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new Error(`Invalid AMS slot: ${slot}`);
  return `ams-${slot}-${normalizeHex(hex).slice(1)}`;
}

export function amsColorToPaletteColor(color: AmsColor): PaletteColor {
  const hex = normalizeHex(color.hex);
  const value = Number.parseInt(hex.slice(1), 16);
  const rgb: [number, number, number] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return {
    id: color.id,
    name: color.name,
    hex,
    rgb,
    primaryBrand: 'MARD',
    primaryCode: color.name,
    codes: { MARD: color.name },
    group: 'AMS',
  };
}

export function paletteColorFromAmsId(id: string): PaletteColor | null {
  const match = /^ams-([1-4])-([0-9a-f]{6})$/.exec(id);
  return match ? amsColorToPaletteColor({ id, name: `AMS ${match[1]}`, hex: `#${match[2]}` }) : null;
}

function srgbToLinear(value: number): number {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function rgbToOklab(rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabDistance(a: [number, number, number], b: [number, number, number]): number {
  const left = rgbToOklab(a);
  const right = rgbToOklab(b);
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

export function nearestPaletteColorOklab(hex: string, palette: PaletteColor[]): PaletteColor {
  if (!palette.length) throw new Error('At least one AMS color is required');
  const value = Number.parseInt(normalizeHex(hex).slice(1), 16);
  const rgb: [number, number, number] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return palette.reduce(
    (best, color) => {
      const distance = oklabDistance(rgb, color.rgb);
      return distance < best.distance ? { color, distance } : best;
    },
    { color: palette[0], distance: Number.POSITIVE_INFINITY },
  ).color;
}
