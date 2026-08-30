import { withMaterials } from '../project';
import type { BeadProject, MaterialProfile } from '../types';
import { normalizeHex } from './colors';
import { buildStackPalette } from './stacking';

export const MAX_PROFILE_FILE_BYTES = 1024 * 1024;

export function calibrationProject(project: BeadProject): BeadProject {
  const cells = buildStackPalette(project.amsColors).map((color) => color.id);
  const layer = { ...project.layers[0], id: 'calibration', name: 'Calibration', cells };
  return {
    ...project,
    name: `${project.materialProfile.name} calibration`,
    width: cells.length,
    height: 1,
    cells,
    layers: [layer],
    activeLayerId: layer.id,
    printSettings: {
      ...project.printSettings,
      mode: 'layered',
      baseColorId: project.amsColors[0].id,
      borderWidthMm: 1,
      separateBase: false,
      hangingHoleDiameterMm: 0,
      backText: 'CAL',
    },
  };
}

export function materialProfileFromProject(project: BeadProject): MaterialProfile {
  return {
    ...project.materialProfile,
    measuredColors: project.materialProfile.measuredColors.map((color) => ({ ...color })),
    materials: project.amsColors.map((material) => ({ ...material })),
  };
}

export function applyMaterialProfile(project: BeadProject, value: unknown): BeadProject {
  const profile = parseMaterialProfile(value);
  const remapped = withMaterials(project, profile.materials);
  return {
    ...remapped,
    materialProfile: {
      version: '1.0.0',
      name: profile.name,
      printer: profile.printer,
      nozzleDiameterMm: profile.nozzleDiameterMm,
      layerHeightMm: profile.layerHeightMm,
      verified: profile.verified,
      measuredColors: profile.measuredColors.map((color) => ({ ...color })),
    },
  };
}

export function parseMaterialProfile(value: unknown): MaterialProfile {
  if (!isRecord(value) || value.version !== '1.0.0' || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80
    || typeof value.printer !== 'string' || !value.printer.trim() || value.printer.length > 80
    || ![0.2, 0.4, 0.6, 0.8].includes(Number(value.nozzleDiameterMm))
    || typeof value.layerHeightMm !== 'number' || !Number.isFinite(value.layerHeightMm) || value.layerHeightMm < 0.04 || value.layerHeightMm > 0.4
    || typeof value.verified !== 'boolean' || !Array.isArray(value.materials) || value.materials.length < 1 || value.materials.length > 4
    || !Array.isArray(value.measuredColors) || value.measuredColors.length > 13) throw new Error('Invalid material profile.');
  const materials = value.materials.map((item, index) => {
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80
      || typeof item.hex !== 'string' || typeof item.tdMm !== 'number' || !Number.isFinite(item.tdMm) || item.tdMm <= 0 || item.tdMm > 100) {
      throw new Error('Invalid material profile.');
    }
    const hex = normalizeHex(item.hex);
    return { id: `ams-${index + 1}-${hex.slice(1)}`, name: item.name.trim(), hex, tdMm: item.tdMm };
  });
  const measuredColors = value.measuredColors.map((item) => {
    if (!isRecord(item) || !Number.isSafeInteger(item.stopLevel) || Number(item.stopLevel) < 4 || Number(item.stopLevel) > materials.length * 4
      || typeof item.hex !== 'string') throw new Error('Invalid material profile.');
    return { stopLevel: Number(item.stopLevel), hex: normalizeHex(item.hex) };
  });
  const measuredStops = new Set(measuredColors.map(({ stopLevel }) => stopLevel));
  if (measuredStops.size !== measuredColors.length) throw new Error('Invalid material profile.');
  if (value.verified && materials.length >= 2
    && Array.from({ length: materials.length * 4 - 3 }, (_, index) => index + 4).some((stop) => !measuredStops.has(stop))) {
    throw new Error('A verified layered profile needs every calibration stop.');
  }
  return {
    version: '1.0.0',
    name: value.name.trim(),
    printer: value.printer.trim(),
    nozzleDiameterMm: Number(value.nozzleDiameterMm) as MaterialProfile['nozzleDiameterMm'],
    layerHeightMm: value.layerHeightMm,
    verified: value.verified,
    measuredColors,
    materials,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
