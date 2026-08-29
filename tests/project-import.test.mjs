import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  hasEditableWork,
  isSafeProjectImport,
  MAX_PROJECT_FILE_BYTES,
  normalizeProject,
} from "../generated/dist/src/project.js";

test("project import normalizes malformed print settings to safe values", () => {
  const project = createProject(1, 1);
  project.printSettings = {
    cellPitchMm: "five",
    baseThicknessMm: 99,
    beadHeightMm: -1,
    dimpleDiameterMm: 5,
    dimpleDepthMm: Number.POSITIVE_INFINITY,
    baseColorId: Number.NaN,
    mode: "unsupported",
  };

  const normalized = normalizeProject(project);

  assert.deepEqual(normalized.printSettings, {
    cellPitchMm: 5,
    baseThicknessMm: 5,
    beadHeightMm: 0.2,
    dimpleDiameterMm: 4.8,
    dimpleDepthMm: 0,
    baseColorId: normalized.amsColors[0].id,
    mode: "solid",
    borderWidthMm: 0,
    separateBase: false,
    hangingHoleDiameterMm: 0,
    backText: "",
  });
});

test("project import rejects unsafe dimensions, layer counts, and file sizes", () => {
  const project = createProject(1, 1);
  assert.equal(isSafeProjectImport({ ...project, width: 181, height: 10 }, 100), false);
  assert.equal(isSafeProjectImport({
    ...project,
    layers: Array.from({ length: 65 }, () => project.layers[0]),
  }, 100), false);
  assert.equal(isSafeProjectImport(project, MAX_PROJECT_FILE_BYTES + 1), false);
  assert.equal(isSafeProjectImport(project, Number.NaN), false);
});

test("project import rejects malformed nested records without throwing", () => {
  const project = createProject(2, 1);
  const malformed = [
    { ...project, layers: [null] },
    { ...project, amsColors: "oops" },
    { ...project, amsColors: [{ ...project.amsColors[0], name: 7 }] },
    { ...project, boardSettings: { ...project.boardSettings, boardWidth: 0 } },
    { ...project, settings: { ...project.settings, beadsPerPack: 0 } },
    { ...project, layers: [project.layers[0], { ...project.layers[0] }] },
  ];
  for (const candidate of malformed) {
    assert.doesNotThrow(() => isSafeProjectImport(candidate, 100));
    assert.equal(isSafeProjectImport(candidate, 100), false);
  }
});

test("normalization repairs duplicate or malformed draft layers deterministically", () => {
  const project = createProject(1, 1);
  const normalized = normalizeProject({
    ...project,
    layers: [project.layers[0], { ...project.layers[0] }, null],
  });
  assert.equal(normalized.layers.length, 3);
  assert.equal(new Set(normalized.layers.map(({ id }) => id)).size, 3);
  assert.ok(normalized.layers.every((layer) => layer.cells.length === 1));
});

test("normalization remaps legacy AMS ids in cells and the base reference", () => {
  const project = createProject(1, 1);
  const legacyId = "legacy-white";
  project.amsColors[0] = { ...project.amsColors[0], id: legacyId };
  project.printSettings.baseColorId = legacyId;
  project.layers[0].cells = [legacyId];
  project.cells = [legacyId];

  assert.equal(isSafeProjectImport(project, 100), true);
  const normalized = normalizeProject(project);
  assert.equal(normalized.layers[0].cells[0], normalized.amsColors[0].id);
  assert.equal(normalized.printSettings.baseColorId, normalized.amsColors[0].id);
});

test("legacy projects without layers keep their top-level cells", () => {
  const project = createProject(1, 1);
  project.cells = [project.amsColors[1].id];
  delete project.layers;
  delete project.activeLayerId;

  assert.equal(isSafeProjectImport(project, 100), true);
  const normalized = normalizeProject(project);
  assert.deepEqual(normalized.layers[0].cells, project.cells);
  assert.deepEqual(normalized.cells, project.cells);
});

test("empty projects are replaceable but edited grids are not", () => {
  assert.equal(hasEditableWork(createProject(10, 10)), false);
  const edited = createProject(10, 10);
  edited.layers[0].cells[0] = edited.amsColors[0].id;
  assert.equal(hasEditableWork(edited), true);
});
