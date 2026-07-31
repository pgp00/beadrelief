import test from "node:test";
import assert from "node:assert/strict";
import { createProject, withStackTemplate } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel, meshBounds } from "../generated/dist/src/print/model.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";
import { validatePrintableModel } from "../generated/dist/src/print/validation.js";

test("a new printable project fits the default 32-cell image workflow", () => {
  const project = createProject();
  assert.deepEqual({ width: project.width, height: project.height }, { width: 32, height: 32 });
  assert.equal(buildPrintableModel(composePrintableGrid(project)).sizeMm.x, 160);
});

test("visible cells become a base plus one part per used color", () => {
  const project = createProject(2, 2);
  project.layers[0].cells = [
    "ams-1-1c1c1c", "ams-2-f4f1e8",
    null, "ams-2-f4f1e8",
  ];
  const grid = composePrintableGrid(project);
  const model = buildPrintableModel(grid);
  assert.deepEqual(grid.cells, [
    "ams-1-1c1c1c", "ams-2-f4f1e8",
    "ams-1-1c1c1c", "ams-2-f4f1e8",
  ]);
  assert.deepEqual(model.parts.map((part) => part.name), ["Base", "Beads_Black", "Beads_White"]);
  assert.deepEqual(model.materials.map((material) => material.id), ["ams-1-1c1c1c", "ams-2-f4f1e8"]);
  assert.deepEqual(model.sizeMm, { x: 10, y: 10, z: 2 });
});

test("print material names cannot be blank", () => {
  const model = buildPrintableModel(composePrintableGrid(createProject(1, 1)));
  model.materials[0].name = " ";
  assert.match(validatePrintableModel(model).join("\n"), /name/);
});

test("layered cells become four disjoint material bands", () => {
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  assert.equal(model.mode, "layered");
  assert.deepEqual(model.parts.map((part) => part.name), [
    "Base_and_Beads_Bambu_PLA_Basic_Blue",
    "Stack_Bambu_PLA_Basic_Red",
    "Stack_Bambu_PLA_Basic_Yellow",
    "Stack_Bambu_PLA_Basic_White",
  ]);
  assert.deepEqual(model.parts.map(meshBounds), [
    { min: [0, 0, 0], max: [20, 5, 1.52] },
    { min: [5, 0, 1.52], max: [20, 5, 1.84] },
    { min: [10, 0, 1.84], max: [20, 5, 2.16] },
    { min: [15, 0, 2.16], max: [20, 5, 2.48] },
  ]);
  assert.deepEqual(model.sizeMm, { x: 20, y: 5, z: 2.48 });
  assert.deepEqual(model.layered, { layerHeightMm: 0.08, perceivedColorCount: 4, swapCount: 3 });
});

test("malformed layered stack IDs are reported by model validation", () => {
  const project = withStackTemplate(createProject(1, 1), "rybw");
  project.layers[0].cells = ["stack-bad"];
  const model = buildPrintableModel(composePrintableGrid(project));
  assert.match(validatePrintableModel(model).join("\n"), /invalid layered stop color/);
});

test("the largest layered grid validates without spread argument overflow", () => {
  const project = withStackTemplate(createProject(50, 50), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells.fill(palette[12].id);
  const model = buildPrintableModel(composePrintableGrid(project));
  assert.deepEqual(validatePrintableModel(model, false), []);
});
