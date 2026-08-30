import type { AmsColor, MeasuredStackColor, PaletteColor } from '../types.js';
import { hexToRgb, makeAmsColorId, normalizeHex } from './colors.js';

export const STACK_LAYER_HEIGHT_MM = 0.08;
export const STACK_LAYERS_PER_FILAMENT = 4;

export type StackTemplateId = 'cmyw' | 'rybw';
export type StackPaletteColor = PaletteColor & {
  stopLevel: number;
  materialIndex: number;
};

function material(slot: number, name: string, hex: string): AmsColor {
  return { id: makeAmsColorId(slot, hex), name, hex: normalizeHex(hex), tdMm: 1 };
}

export const STACK_TEMPLATES: Record<StackTemplateId, AmsColor[]> = {
  cmyw: [
    material(1, 'Bambu PLA Basic Cyan', '#00aeef'),
    material(2, 'Bambu PLA Basic Magenta', '#ec008c'),
    material(3, 'Bambu PLA Basic Yellow', '#f4ee2a'),
    material(4, 'Bambu PLA Basic White', '#ffffff'),
  ],
  rybw: [
    material(1, 'Bambu PLA Basic Blue', '#0a2989'),
    material(2, 'Bambu PLA Basic Red', '#c12e1f'),
    material(3, 'Bambu PLA Basic Yellow', '#f4ee2a'),
    material(4, 'Bambu PLA Basic White', '#ffffff'),
  ],
};

export function transmissionAtThickness(thicknessMm: number, tdMm: number): number {
  if (!Number.isFinite(thicknessMm) || thicknessMm < 0) throw new Error('Thickness must be zero or positive.');
  if (!Number.isFinite(tdMm) || tdMm <= 0) throw new Error('TD must be positive.');
  return 0.05 ** (thicknessMm / tdMm);
}

export function makeStackColorId(stopLevel: number, hex: string): string {
  if (!Number.isInteger(stopLevel) || stopLevel < STACK_LAYERS_PER_FILAMENT || stopLevel > 99) {
    throw new Error(`Invalid stack stop level: ${stopLevel}`);
  }
  return `stack-${String(stopLevel).padStart(2, '0')}-${normalizeHex(hex).slice(1)}`;
}

export function parseStackColorId(id: string): { stopLevel: number; hex: string } | null {
  const match = /^stack-(\d{2})-([0-9a-f]{6})$/.exec(id);
  if (!match) return null;
  const stopLevel = Number(match[1]);
  return stopLevel >= STACK_LAYERS_PER_FILAMENT ? { stopLevel, hex: `#${match[2]}` } : null;
}

export function paletteColorFromStackId(id: string): PaletteColor | null {
  const parsed = parseStackColorId(id);
  return parsed ? toPaletteColor(parsed.stopLevel, -1, `Layer ${parsed.stopLevel}`, parsed.hex) : null;
}

export function buildStackPalette(materials: AmsColor[]): StackPaletteColor[] {
  if (materials.length < 2 || materials.length > 4) throw new Error('Layered mode needs two to four filaments.');
  const result: StackPaletteColor[] = [];
  let under = hexToRgb(materials[0].hex);
  result.push(toPaletteColor(4, 0, materials[0].name, rgbToHex(under)));
  for (let materialIndex = 1; materialIndex < materials.length; materialIndex += 1) {
    const over = hexToRgb(materials[materialIndex].hex);
    const bandUnder = under;
    for (let layer = 1; layer <= STACK_LAYERS_PER_FILAMENT; layer += 1) {
      const stopLevel = materialIndex * STACK_LAYERS_PER_FILAMENT + layer;
      const thickness = layer * STACK_LAYER_HEIGHT_MM;
      under = blendLinear(bandUnder, over, transmissionAtThickness(thickness, materials[materialIndex].tdMm));
      result.push(toPaletteColor(stopLevel, materialIndex, `${materials[materialIndex].name} ${layer}/4`, rgbToHex(under)));
    }
  }
  return result;
}

export function applyMeasuredStackColors(palette: StackPaletteColor[], measured: MeasuredStackColor[]): StackPaletteColor[] {
  const colors = new Map(measured.map(({ stopLevel, hex }) => [stopLevel, normalizeHex(hex)]));
  return palette.map((color) => {
    const hex = colors.get(color.stopLevel);
    return hex ? { ...color, hex, rgb: hexToRgb(hex) } : color;
  });
}

export function hasCompleteStackCalibration(materialCount: number, measured: MeasuredStackColor[]): boolean {
  if (materialCount < 2) return true;
  const stops = new Set(measured.map(({ stopLevel }) => stopLevel));
  return Array.from(
    { length: materialCount * STACK_LAYERS_PER_FILAMENT - (STACK_LAYERS_PER_FILAMENT - 1) },
    (_, index) => index + STACK_LAYERS_PER_FILAMENT,
  ).every((stopLevel) => stops.has(stopLevel));
}

function toPaletteColor(stopLevel: number, materialIndex: number, name: string, hex: string): StackPaletteColor {
  return {
    id: makeStackColorId(stopLevel, hex),
    name,
    hex,
    rgb: hexToRgb(hex).map(Math.round) as [number, number, number],
    primaryBrand: 'MARD',
    primaryCode: `L${stopLevel}`,
    codes: { MARD: `L${stopLevel}` },
    group: 'Layered',
    stopLevel,
    materialIndex,
  };
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

function blendLinear(under: [number, number, number], over: [number, number, number], transmission: number): [number, number, number] {
  return under.map((value, index) => {
    const linear = srgbToLinear(over[index]) * (1 - transmission) + srgbToLinear(value) * transmission;
    return linearToSrgb(linear);
  }) as [number, number, number];
}

function srgbToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const channel = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, channel * 255));
}
