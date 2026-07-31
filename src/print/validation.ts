import type { PrintableModel, PrintablePart } from './model';

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

export function validatePrintableModel(model: PrintableModel): string[] {
  const errors: string[] = [];
  if (model.gridSize.width <= 0 || model.gridSize.height <= 0) errors.push('The printable grid is empty.');
  if (model.materials.length < 1 || model.materials.length > 4) errors.push('Use between one and four materials.');
  if (model.materials.some((material) => !material.name.trim())) errors.push('Every material needs a name.');
  if (model.parts.length < 2) errors.push('The model needs a base and at least one bead part.');
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
  if (!Number.isFinite(settings.dimpleDiameterMm) || settings.dimpleDiameterMm < 0 || settings.dimpleDiameterMm >= settings.cellPitchMm) {
    errors.push('Dimple diameter must be zero or less than cell pitch.');
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
    const openEdges = closedEdgeErrors(part);
    if (openEdges.length) errors.push(`${part.name} is not closed (${openEdges.length} edges).`);
  }
  return errors;
}
