import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";

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
