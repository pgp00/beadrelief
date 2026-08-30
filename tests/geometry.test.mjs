import test from "node:test";
import assert from "node:assert/strict";
import { createProject, withStackTemplate } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel, meshBounds } from "../generated/dist/src/print/model.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";
import { closedEdgeErrors, validatePrintableModel } from "../generated/dist/src/print/validation.js";

function triangleComponentCount(part) {
  const trianglesByVertex = Array.from({ length: part.vertices.length / 3 }, () => []);
  for (let triangle = 0; triangle < part.triangles.length / 3; triangle += 1) {
    for (const vertex of part.triangles.slice(triangle * 3, triangle * 3 + 3)) {
      trianglesByVertex[vertex].push(triangle);
    }
  }
  const visited = new Set();
  let components = 0;
  for (let triangle = 0; triangle < part.triangles.length / 3; triangle += 1) {
    if (visited.has(triangle)) continue;
    components += 1;
    const pending = [triangle];
    visited.add(triangle);
    while (pending.length) {
      const current = pending.pop();
      for (const vertex of part.triangles.slice(current * 3, current * 3 + 3)) {
        for (const neighbor of trianglesByVertex[vertex]) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
  }
  return components;
}

function horizontalTriangleArea(part, z) {
  let area = 0;
  for (let index = 0; index < part.triangles.length; index += 3) {
    const vertices = [...part.triangles.slice(index, index + 3)];
    if (!vertices.every((vertex) => Math.abs(part.vertices[vertex * 3 + 2] - z) < 1e-6)) continue;
    const [a, b, c] = vertices.map((vertex) => part.vertices.slice(vertex * 3, vertex * 3 + 2));
    area += Math.abs(
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ) / 2;
  }
  return area;
}

function regularPolygonArea(radius, segments = 24) {
  return segments * radius ** 2 * Math.sin(Math.PI * 2 / segments) / 2;
}

test("the base and every fused bead shell are closed triangle meshes", () => {
  const project = createProject(2, 1);
  project.layers[0].cells = ["ams-1-1c1c1c", "ams-2-f4f1e8"];
  const model = buildPrintableModel(composePrintableGrid(project));
  assert.equal(model.parts.length, 3);
  for (const part of model.parts) assert.deepEqual(closedEdgeErrors(part), []);
  assert.deepEqual(model.sizeMm, { x: 10, y: 5, z: 2 });
  assert.deepEqual(meshBounds(model.parts[0]), { min: [0, 0, 0], max: [10, 5, 1.2] });
  assert.equal(meshBounds(model.parts[1]).min[2], 1.2);
  assert.equal(meshBounds(model.parts[1]).max[2], 2);
  assert.deepEqual(validatePrintableModel(model), []);
  assert.match(validatePrintableModel({ ...model, sizeMm: { ...model.sizeMm, x: 251 } }).join("\n"), /250/);
});

test("zero-size dimples produce a flat top without degenerate triangles", () => {
  const project = createProject(1, 1);
  project.printSettings.dimpleDiameterMm = 0;
  project.printSettings.dimpleDepthMm = 0;
  const model = buildPrintableModel(composePrintableGrid(project));
  for (const part of model.parts) {
    assert.deepEqual(closedEdgeErrors(part), []);
    for (let index = 0; index < part.triangles.length; index += 3) {
      const points = [...part.triangles.slice(index, index + 3)].map((vertex) =>
        part.vertices.slice(vertex * 3, vertex * 3 + 3),
      );
      const ab = points[1].map((value, axis) => value - points[0][axis]);
      const ac = points[2].map((value, axis) => value - points[0][axis]);
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      assert.ok(cross.some((value) => Math.abs(value) > 1e-8));
    }
  }
});

test("a dimple cannot consume the full bead height", () => {
  const project = createProject(1, 1);
  project.printSettings.dimpleDepthMm = project.printSettings.beadHeightMm;
  const errors = validatePrintableModel(buildPrintableModel(composePrintableGrid(project)));
  assert.match(errors.join("\n"), /less than bead height/);
  project.printSettings.dimpleDepthMm = 0.2;
  project.printSettings.dimpleDiameterMm = project.printSettings.cellPitchMm;
  const diameterErrors = validatePrintableModel(buildPrintableModel(composePrintableGrid(project)));
  assert.match(diameterErrors.join("\n"), /less than cell pitch/);
});

test("the largest selectable dimple does not collapse the top rings", () => {
  const project = createProject(1, 1);
  project.printSettings.dimpleDiameterMm = 4.9;
  const errors = validatePrintableModel(buildPrintableModel(composePrintableGrid(project)));
  assert.match(errors.join("\n"), /dimple diameter/i);
});

test("minimum relief keeps bead rings in ascending Z order", () => {
  const project = createProject(1, 1);
  project.printSettings.beadHeightMm = 0.2;
  project.printSettings.dimpleDepthMm = 0.1;
  const bead = buildPrintableModel(composePrintableGrid(project)).parts[1];
  const ringZ = [0, 1, 2, 3].map((ring) => bead.vertices[ring * 24 * 3 + 2]);
  assert.deepEqual(ringZ, [...ringZ].sort((a, b) => a - b));
});

test("interactive validation can skip the export-only topology scan", () => {
  const model = buildPrintableModel(composePrintableGrid(createProject(1, 1)));
  model.parts[1].triangles = model.parts[1].triangles.slice(3);
  assert.match(validatePrintableModel(model).join("\n"), /not closed/);
  assert.doesNotMatch(validatePrintableModel(model, false).join("\n"), /not closed/);
});

test("export validation rejects zero-area triangles", () => {
  const model = buildPrintableModel(composePrintableGrid(createProject(1, 1)));
  model.parts[1].triangles[1] = model.parts[1].triangles[0];
  assert.match(validatePrintableModel(model).join("\n"), /degenerate triangle/);
});

test("every layered material band is closed and only touches its neighbors", () => {
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  model.parts.forEach((part) => assert.deepEqual(closedEdgeErrors(part), []));
  assert.deepEqual(validatePrintableModel(model), []);
  for (let index = 1; index < model.parts.length; index += 1) {
    assert.equal(meshBounds(model.parts[index - 1]).max[2], meshBounds(model.parts[index]).min[2]);
  }
  project.printSettings.baseThicknessMm = 1.21;
  assert.match(validatePrintableModel(buildPrintableModel(composePrintableGrid(project))).join("\n"), /multiple of 0.08 mm/);
});

test("a one-layer exposed dimple band closes with one annular bottom surface", () => {
  const project = withStackTemplate(createProject(1, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[1].id];
  const part = buildPrintableModel(composePrintableGrid(project)).parts[1];
  const bottomZ = meshBounds(part).min[2];
  const expectedArea = regularPolygonArea(project.printSettings.cellPitchMm / 2)
    - regularPolygonArea(project.printSettings.dimpleDiameterMm / 2);
  assert.ok(Math.abs(horizontalTriangleArea(part, bottomZ) - expectedArea) < 1e-5);
  assert.deepEqual(closedEdgeErrors(part), []);
});

test("the combined layered base and first band share one triangle component", () => {
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const firstPart = buildPrintableModel(composePrintableGrid(project)).parts[0];
  assert.equal(triangleComponentCount(firstPart), 1);
  assert.deepEqual(closedEdgeErrors(firstPart), []);
});

test("zero-dimple layered bands remain closed", () => {
  const project = withStackTemplate(createProject(2, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[1].id];
  project.printSettings.dimpleDiameterMm = 0;
  project.printSettings.dimpleDepthMm = 0;
  const model = buildPrintableModel(composePrintableGrid(project));
  model.parts.forEach((part) => assert.deepEqual(closedEdgeErrors(part), []));
  assert.deepEqual(validatePrintableModel(model), []);
});
