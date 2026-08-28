import type { PrintSettings } from '../types';

export const PRINT_SETTING_LIMITS = {
  cellPitchMm: { min: 2, max: 10 },
  baseThicknessMm: { min: 0.4, max: 5 },
  beadHeightMm: { min: 0.2, max: 4 },
  dimpleDiameterMm: { min: 0, max: 5 },
  dimpleDepthMm: { min: 0, max: 2 },
} as const;

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  cellPitchMm: 5,
  baseThicknessMm: 1.2,
  beadHeightMm: 0.8,
  dimpleDiameterMm: 1.2,
  dimpleDepthMm: 0.2,
  baseColorId: 'ams-1-1c1c1c',
  mode: 'solid',
};
