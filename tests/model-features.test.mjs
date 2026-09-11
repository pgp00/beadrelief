import test from "node:test";
import assert from "node:assert/strict";
import { createProject, normalizeProject, withStackTemplate } from "../generated/dist/src/project.js";
import { buildPrintableModel, composePrintableGrid, meshBounds } from "../generated/dist/src/print/model.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";
import { closedEdgeErrors, validatePrintableModel } from "../generated/dist/src/print/validation.js";

test("border, hanging loop, and recessed back text export as closed printable parts", () => {
  const project = createProject(2, 1);
  Object.assign(project.printSettings, {
    borderWidthMm: 1,
    hangingHoleDiameterMm: 4,
    backText: "BR 1",
  });
  const model = buildPrintableModel(composePrintableGrid(project));
  assert.deepEqual(model.parts.map(({ name }) => name), ["Base", `Beads_${project.amsColors[0].name}`, "Border", "Hanging_Loop"]);
  assert.deepEqual(model.sizeMm, { x: 12, y: 16, z: 2 });
  for (const part of model.parts) assert.deepEqual(closedEdgeErrors(part), []);
  assert.deepEqual(meshBounds(model.parts.at(-1)), { min: [1.5, 4.5, 0], max: [10.5, 16, 1.2] });
  assert.deepEqual(validatePrintableModel(model), []);
});

test("layered backplates can be detached from every material stack", () => {
  const project = withStackTemplate(createProject(1, 1), "cmyw");
  project.printSettings.separateBase = true;
  project.printSettings.hangingHoleDiameterMm = 4;
  const model = buildPrintableModel(composePrintableGrid(project));
  assert.equal(model.parts[0].name, "Base");
  assert.match(model.parts[1].name, /^Stack_/);
  assert.equal(meshBounds(model.parts[0]).max[2], project.printSettings.baseThicknessMm);
  assert.equal(meshBounds(model.parts[1]).min[2], project.printSettings.baseThicknessMm);
  assert.deepEqual(validatePrintableModel(model), []);
});

test("layered export rejects a full-height base-material border", () => {
  const project = withStackTemplate(createProject(1, 1), "cmyw");
  project.layers[0].cells = [buildStackPalette(project.amsColors).at(-1).id];
  project.printSettings.borderWidthMm = 1;
  const errors = validatePrintableModel(buildPrintableModel(composePrintableGrid(project)), false);
  assert.ok(errors.some((error) => /layered.*border/i.test(error)));
});

test("legacy projects receive safe structure defaults and sanitize back text", () => {
  const normalized = normalizeProject({ width: 1, height: 1, cells: [null], printSettings: { backText: "a!b@2" } });
  assert.equal(normalized.printSettings.backText, "AB2");
  assert.equal(normalized.printSettings.borderWidthMm, 0);
  assert.equal(normalized.printSettings.hangingHoleDiameterMm, 0);
  assert.equal(normalized.printSettings.separateBase, false);
});
