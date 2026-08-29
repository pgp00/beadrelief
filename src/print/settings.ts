import type { PrintSettings } from '../types';
import { STACK_LAYER_HEIGHT_MM } from './stacking';

export type NumericPrintSetting = keyof Pick<
  PrintSettings,
  'cellPitchMm' | 'baseThicknessMm' | 'beadHeightMm' | 'dimpleDiameterMm' | 'dimpleDepthMm' | 'borderWidthMm' | 'hangingHoleDiameterMm'
>;

export const PRINT_SETTING_LIMITS = {
  cellPitchMm: { min: 2, max: 10 },
  baseThicknessMm: { min: 0.4, max: 5 },
  beadHeightMm: { min: 0.2, max: 4 },
  dimpleDiameterMm: { min: 0, max: 5 },
  dimpleDepthMm: { min: 0, max: 2 },
  borderWidthMm: { min: 0, max: 5 },
  hangingHoleDiameterMm: { min: 0, max: 12 },
} as const;

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  cellPitchMm: 5,
  baseThicknessMm: 1.2,
  beadHeightMm: 0.8,
  dimpleDiameterMm: 1.2,
  dimpleDepthMm: 0.2,
  baseColorId: 'ams-1-1c1c1c',
  mode: 'solid',
  borderWidthMm: 0,
  separateBase: false,
  hangingHoleDiameterMm: 0,
  backText: '',
};

export function normalizePrintSetting(
  key: NumericPrintSetting,
  value: unknown,
  fallback = DEFAULT_PRINT_SETTINGS[key],
): number {
  const limits = PRINT_SETTING_LIMITS[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(limits.max, Math.max(limits.min, value))
    : fallback;
}

export function normalizeLayeredBaseThickness(value: unknown, fallback = DEFAULT_PRINT_SETTINGS.baseThicknessMm): number {
  const maximum = Math.floor(PRINT_SETTING_LIMITS.baseThicknessMm.max / STACK_LAYER_HEIGHT_MM) * STACK_LAYER_HEIGHT_MM;
  const normalized = normalizePrintSetting('baseThicknessMm', value, fallback);
  return Number(Math.min(maximum, Math.round(normalized / STACK_LAYER_HEIGHT_MM) * STACK_LAYER_HEIGHT_MM).toFixed(2));
}
