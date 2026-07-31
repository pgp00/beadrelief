import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel, meshBounds } from "../generated/dist/src/print/model.js";
import { closedEdgeErrors, validatePrintableModel } from "../generated/dist/src/print/validation.js";

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
