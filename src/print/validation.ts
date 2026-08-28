import type { PrintableModel, PrintablePart } from './model';
import { STACK_LAYER_HEIGHT_MM } from './stacking';

export const MAX_EXPORT_GRID_DIMENSION = 32;

export function closedEdgeErrors(part: PrintablePart): string[] {
  const counts = new Map<string, number>();
  for (let index = 0; index < part.triangles.length; index += 3) {
    const triangle = part.triangles.slice(index, index + 3);
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, count]) => count !== 2)
    .map(([edge, count]) => `${edge}=${count}`);
}

export function validatePrintableModel(model: PrintableModel, checkTopology = true): string[] {
  const errors = [...model.inputErrors];
  if (model.gridSize.width <= 0 || model.gridSize.height <= 0) errors.push('The printable grid is empty.');
  if (
    model.gridSize.width > MAX_EXPORT_GRID_DIMENSION ||
    model.gridSize.height > MAX_EXPORT_GRID_DIMENSION
  ) {
    errors.push('3MF export supports up to 32 × 32 cells in v0.1.0.');
  }
  if (model.materials.length < 1 || model.materials.length > 4) errors.push('Use between one and four materials.');
  if (model.materials.some((material) => !material.name.trim())) errors.push('Every material needs a name.');
  if (model.parts.length < (model.mode === 'layered' ? 1 : 2)) {
    errors.push(model.mode === 'layered'
      ? 'The layered model needs a combined base/bead part.'
      : 'The model needs a base and at least one bead part.');
  }
  for (const [axis, value] of Object.entries(model.sizeMm)) {
    if (!Number.isFinite(value) || value <= 0) errors.push(`Model ${axis.toUpperCase()} must be positive.`);
  }
  if (model.sizeMm.x > 250 || model.sizeMm.y > 250) errors.push('Model X and Y must stay within 250 mm.');

  const settings = model.settings;
  for (const [name, value] of [
    ['Cell pitch', settings.cellPitchMm],
    ['Base thickness', settings.baseThicknessMm],
    ['Bead height', settings.beadHeightMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) errors.push(`${name} must be positive.`);
  }
  if (!Number.isFinite(settings.dimpleDepthMm) || settings.dimpleDepthMm < 0 || settings.dimpleDepthMm >= settings.beadHeightMm) {
    errors.push('Dimple depth must be zero or less than bead height.');
  }
  if (!Number.isFinite(settings.dimpleDiameterMm) || settings.dimpleDiameterMm < 0 || settings.dimpleDiameterMm >= settings.cellPitchMm - 0.1) {
    errors.push('Dimple diameter must be zero or at least 0.1 mm less than cell pitch.');
  }

  if (model.mode === 'layered') {
    if (model.materials.length < 2 || model.materials.length > 4) {
      errors.push('Layered mode needs two to four filaments.');
    }
    if (model.materials.some((material) => !Number.isFinite(material.tdMm) || material.tdMm <= 0 || material.tdMm > 100)) {
      errors.push('Every layered filament TD must be between 0.01 and 100 mm.');
    }
    const baseLayers = model.settings.baseThicknessMm / STACK_LAYER_HEIGHT_MM;
    if (Math.abs(baseLayers - Math.round(baseLayers)) >= 1e-6) {
      errors.push('Layered base thickness must be a multiple of 0.08 mm.');
    }
    const spans = model.parts.map((part) => {
      let min = Infinity;
      let max = -Infinity;
      for (let index = 2; index < part.vertices.length; index += 3) {
        min = Math.min(min, part.vertices[index]);
        max = Math.max(max, part.vertices[index]);
      }
      return { name: part.name, min, max };
    });
    for (let left = 0; left < spans.length; left += 1) {
      for (let right = left + 1; right < spans.length; right += 1) {
        if (Math.min(spans[left].max, spans[right].max) - Math.max(spans[left].min, spans[right].min) > 1e-6) {
          errors.push(`${spans[left].name} and ${spans[right].name} overlap in Z.`);
        }
      }
    }
  }

  const materialIds = new Set(model.materials.map((material) => material.id));
  for (const part of model.parts) {
    if (!materialIds.has(part.materialId)) errors.push(`${part.name} references a missing material.`);
    if (!part.vertices.length || !part.triangles.length) {
      errors.push(`${part.name} is empty.`);
      continue;
    }
    if (part.vertices.length % 3 || part.triangles.length % 3) {
      errors.push(`${part.name} has incomplete geometry.`);
      continue;
    }
    const vertexCount = part.vertices.length / 3;
    if ([...part.triangles].some((index) => !Number.isInteger(index) || index < 0 || index >= vertexCount)) {
      errors.push(`${part.name} has an invalid triangle index.`);
      continue;
    }
    if (checkTopology) {
      const degenerateTriangles = countDegenerateTriangles(part);
      if (degenerateTriangles) errors.push(`${part.name} has ${degenerateTriangles} degenerate triangle(s).`);
      const openEdges = closedEdgeErrors(part);
      if (openEdges.length) errors.push(`${part.name} is not closed (${openEdges.length} edges).`);
    }
  }
  return errors;
}

function countDegenerateTriangles(part: PrintablePart): number {
  let count = 0;
  for (let index = 0; index < part.triangles.length; index += 3) {
    const a = part.triangles[index] * 3;
    const b = part.triangles[index + 1] * 3;
    const c = part.triangles[index + 2] * 3;
    const abx = part.vertices[b] - part.vertices[a];
    const aby = part.vertices[b + 1] - part.vertices[a + 1];
    const abz = part.vertices[b + 2] - part.vertices[a + 2];
    const acx = part.vertices[c] - part.vertices[a];
    const acy = part.vertices[c + 1] - part.vertices[a + 1];
    const acz = part.vertices[c + 2] - part.vertices[a + 2];
    const x = aby * acz - abz * acy;
    const y = abz * acx - abx * acz;
    const z = abx * acy - aby * acx;
    if (x * x + y * y + z * z <= 1e-16) count += 1;
  }
  return count;
}
