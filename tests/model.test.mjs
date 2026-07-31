import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";
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
