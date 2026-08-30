import test from "node:test";
import assert from "node:assert/strict";
import { createProject, normalizeProject, withMaterials, withPrintMode } from "../generated/dist/src/project.js";
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

test("calibration is invalidated by physical material changes but survives naming edits", () => {
  const project = withPrintMode(createProject(1, 1), "layered");
  project.materialProfile.verified = true;
  project.materialProfile.measuredColors = buildStackPalette(project.amsColors).map(({ stopLevel, hex }) => ({ stopLevel, hex }));
  const renamed = withMaterials(project, project.amsColors.map((material, index) =>
    index ? material : { ...material, name: "Renamed" }));
  assert.equal(renamed.materialProfile.measuredColors.length, 9);
  assert.equal(renamed.materialProfile.verified, true);
  const changed = withMaterials(renamed, renamed.amsColors.map((material, index) =>
    index ? material : { ...material, tdMm: 2 }));
  assert.equal(changed.amsColors[0].tdMm, 2);
  assert.deepEqual(changed.materialProfile.measuredColors, []);
  assert.equal(changed.materialProfile.verified, false);
});

test("verified layered profiles require unique measurements for every stop", () => {
  const project = createProject(1, 1);
  const profile = materialProfileFromProject(project);
  profile.verified = true;
  profile.measuredColors = [{ stopLevel: 4, hex: "#eeeeee" }];
  assert.throws(() => parseMaterialProfile(profile), /every calibration stop/);
  profile.verified = false;
  profile.measuredColors = [
    { stopLevel: 4, hex: "#eeeeee" },
    { stopLevel: 4, hex: "#dddddd" },
  ];
  assert.throws(() => parseMaterialProfile(profile), /Invalid/);
});

test("project normalization deduplicates measurements and drops stops outside the material set", () => {
  const project = createProject(1, 1);
  project.materialProfile.verified = true;
  project.materialProfile.measuredColors = [
    { stopLevel: 4, hex: "#111111" },
    { stopLevel: 4, hex: "#222222" },
    { stopLevel: 16, hex: "#333333" },
  ];
  const normalized = normalizeProject(project);
  assert.deepEqual(normalized.materialProfile.measuredColors, [{ stopLevel: 4, hex: "#222222" }]);
  assert.equal(normalized.materialProfile.verified, false);
});
