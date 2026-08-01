import test from "node:test";
import assert from "node:assert/strict";
import {
  STACK_LAYER_HEIGHT_MM,
  STACK_TEMPLATES,
  buildStackPalette,
  parseStackColorId,
  transmissionAtThickness,
} from "../generated/dist/src/print/stacking.js";
import { getColor } from "../generated/dist/src/palette.js";
import { composePrintableGrid } from "../generated/dist/src/print/model.js";
import { createLayer, createProject, normalizeProject, withLayeredMaterials, withLayers, withPrintMode, withStackTemplate } from "../generated/dist/src/project.js";
import { summarizeLayeredUsage } from "../generated/dist/src/usage.js";

test("one TD leaves five percent transmission", () => {
  assert.equal(STACK_LAYER_HEIGHT_MM, 0.08);
  assert.ok(Math.abs(transmissionAtThickness(1.25, 1.25) - 0.05) < 1e-12);
});

test("four filaments create thirteen ordered printable stop colors", () => {
  const palette = buildStackPalette(STACK_TEMPLATES.rybw);
  assert.equal(palette.length, 13);
  assert.deepEqual(palette.map((color) => color.stopLevel), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.ok(new Set(palette.map((color) => color.hex)).size > 4);
  assert.deepEqual(parseStackColorId(palette[8].id), { stopLevel: 12, hex: palette[8].hex });
  assert.equal(parseStackColorId("stack-bad"), null);
});

test("stack ids below the encoded stop domain are rejected safely", () => {
  assert.equal(parseStackColorId("stack-03-ffffff"), null);
  assert.equal(getColor("stack-03-ffffff"), undefined);
});

test("project normalization removes non-string layered cells", () => {
  const project = withPrintMode(createProject(1, 1), "layered");
  project.layers[0].cells = [3];
  project.cells = [3];
  const normalized = normalizeProject(project);
  assert.deepEqual(normalized.layers[0].cells, [null]);
  assert.deepEqual(composePrintableGrid(normalized).stopLevels, [4]);
});

test("old projects normalize to solid mode with safe TD", () => {
  const old = createProject(1, 1);
  delete old.printSettings.mode;
  old.amsColors.forEach((color) => delete color.tdMm);
  const normalized = normalizeProject(old);
  assert.equal(normalized.printSettings.mode, "solid");
  assert.ok(normalized.amsColors.every((color) => color.tdMm === 1));
});

test("layered project normalization refreshes stack ids after TD defaults change", () => {
  const project = withStackTemplate(createProject(3, 1), "rybw");
  project.amsColors[1].tdMm = 2;
  const savedPalette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [savedPalette[4].id, "stack-bad", "unknown-color"];
  project.cells = project.layers[0].cells.slice();
  delete project.amsColors[1].tdMm;

  const normalized = normalizeProject(project);
  const canonicalPalette = buildStackPalette(normalized.amsColors);
  assert.deepEqual(normalized.layers[0].cells, [canonicalPalette[4].id, canonicalPalette[0].id, canonicalPalette[0].id]);
  assert.deepEqual(normalized.cells, normalized.layers[0].cells);
  assert.equal(parseStackColorId(normalized.layers[0].cells[0]).stopLevel, 8);
  assert.notEqual(normalized.layers[0].cells[0], savedPalette[4].id);
});

test("layered project normalization clamps stops after materials are removed", () => {
  const project = withStackTemplate(createProject(1, 1), "rybw");
  project.layers[0].cells = [buildStackPalette(project.amsColors).at(-1).id];
  project.cells = project.layers[0].cells.slice();
  project.amsColors = project.amsColors.slice(0, 2);

  const normalized = normalizeProject(project);
  const maximum = buildStackPalette(normalized.amsColors).at(-1);
  assert.equal(normalized.layers[0].cells[0], maximum.id);
  assert.equal(parseStackColorId(normalized.layers[0].cells[0]).stopLevel, 8);
  assert.deepEqual(normalized.cells, normalized.layers[0].cells);
});

test("mode changes remap cells and layered TD changes preserve stop levels", () => {
  const solid = createProject(2, 1);
  solid.layers[0].cells = [solid.amsColors[0].id, solid.amsColors[1].id];
  const layered = withPrintMode(solid, "layered");
  const palette = buildStackPalette(layered.amsColors);
  layered.layers[0].cells = [palette[1].id, palette[12].id];
  const levels = layered.layers[0].cells.map((id) => parseStackColorId(id).stopLevel);
  const materials = layered.amsColors.map((color, index) => ({ ...color, tdMm: index === 1 ? 1.7 : color.tdMm }));
  const recalibrated = withLayeredMaterials(layered, materials);
  assert.deepEqual(recalibrated.layers[0].cells.map((id) => parseStackColorId(id).stopLevel), levels);
  assert.ok(recalibrated.layers[0].cells.some((id, index) => id !== layered.layers[0].cells[index]));
  assert.ok(withPrintMode(recalibrated, "solid").layers[0].cells.every((id) => id?.startsWith("ams-")));
});

test("layered usage reports physical filament layer-cells", () => {
  const project = withStackTemplate(createProject(3, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[12].id];
  assert.deepEqual(summarizeLayeredUsage(project).map((row) => row.layerCells), [12, 8, 4, 4]);
});

test("layered usage counts blank cells as the base stack", () => {
  const project = withStackTemplate(createProject(2, 1), "rybw");
  assert.deepEqual(summarizeLayeredUsage(project).map((row) => row.layerCells), [8, 0, 0, 0]);
  project.layers[0].includeInUsage = false;
  assert.deepEqual(summarizeLayeredUsage(project).map((row) => row.layerCells), [0, 0, 0, 0]);
});

test("layered usage composes overlapping selected layers once", () => {
  const project = withStackTemplate(createProject(1, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[12].id];
  const top = createLayer(1, 1, "Top");
  top.visible = false;
  top.cells = [palette[4].id];
  const layered = withLayers(project, [project.layers[0], top]);
  assert.deepEqual(summarizeLayeredUsage(layered).map((row) => row.layerCells), [4, 4, 0, 0]);
});
