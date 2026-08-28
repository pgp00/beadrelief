import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
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
  });
});

test("project import rejects unsafe dimensions, layer counts, and file sizes", () => {
  const project = createProject(1, 1);
  assert.equal(isSafeProjectImport({ ...project, width: 51, height: 10 }, 100), false);
  assert.equal(isSafeProjectImport({
    ...project,
    layers: Array.from({ length: 65 }, () => project.layers[0]),
  }, 100), false);
  assert.equal(isSafeProjectImport(project, MAX_PROJECT_FILE_BYTES + 1), false);
});
