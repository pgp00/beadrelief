import test from "node:test";
import assert from "node:assert/strict";
import { createProject, normalizeProject } from "../generated/dist/src/project.js";
import { applyMaterialProfile, calibrationProject, materialProfileFromProject, parseMaterialProfile } from "../generated/dist/src/print/profile.js";
import { applyMeasuredStackColors, buildStackPalette } from "../generated/dist/src/print/stacking.js";
import { buildPrintableModel, composePrintableGrid } from "../generated/dist/src/print/model.js";
import { validatePrintableModel } from "../generated/dist/src/print/validation.js";

test("material profiles round-trip and apply an immutable project snapshot", () => {
  const project = createProject(1, 1);
  const file = materialProfileFromProject(project);
  file.name = "Studio profile";
  file.printer = "Test printer";
  file.nozzleDiameterMm = 0.6;
  file.materials[0].name = "Measured white";
  file.measuredColors = [{ stopLevel: 4, hex: "#eeeeee" }];
  const applied = applyMaterialProfile(project, JSON.parse(JSON.stringify(file)));

  assert.equal(applied.materialProfile.name, "Studio profile");
  assert.equal(applied.materialProfile.nozzleDiameterMm, 0.6);
  assert.equal(applied.amsColors[0].name, "Measured white");
  assert.deepEqual(applied.materialProfile.measuredColors, [{ stopLevel: 4, hex: "#eeeeee" }]);
  file.measuredColors[0].hex = "#000000";
  assert.equal(applied.materialProfile.measuredColors[0].hex, "#eeeeee");
});

test("profile and legacy project boundaries reject malformed data safely", () => {
  assert.throws(() => parseMaterialProfile({ version: "1.0.0" }), /Invalid/);
  assert.throws(() => parseMaterialProfile({
    version: "1.0.0",
    name: "Bad",
    printer: "Printer",
    nozzleDiameterMm: 0.4,
    layerHeightMm: 0.08,
    verified: false,
    materials: [{ name: "PLA", hex: "white", tdMm: 1 }],
    measuredColors: [],
  }), /color/);
  assert.equal(normalizeProject({ width: 1, height: 1, cells: [null] }).materialProfile.name, "Default example");
});

test("calibration swatches cover every stop and measured colors replace preview estimates", () => {
  const project = createProject(1, 1);
  const swatch = calibrationProject(project);
  const estimated = buildStackPalette(project.amsColors);
  assert.equal(swatch.width, estimated.length);
  assert.deepEqual(swatch.layers[0].cells, estimated.map((color) => color.id));
  assert.deepEqual(validatePrintableModel(buildPrintableModel(composePrintableGrid(swatch))), []);

  const measured = applyMeasuredStackColors(estimated, [{ stopLevel: estimated[1].stopLevel, hex: "#123456" }]);
  assert.equal(measured[1].id, estimated[1].id);
  assert.equal(measured[1].hex, "#123456");
  assert.deepEqual(measured[1].rgb, [18, 52, 86]);
});
