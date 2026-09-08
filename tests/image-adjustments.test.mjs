import test from "node:test";
import assert from "node:assert/strict";

import {
  adjustRgb,
  defaultAdjustments,
  hasAdjustments,
  mergeCloseLayerColors,
} from "../generated/dist/src/imageAdjustments.js";
import { completePalette } from "../generated/dist/src/palette.js";

test("default image adjustments preserve RGB values", () => {
  assert.equal(hasAdjustments(defaultAdjustments), false);
  assert.deepEqual(adjustRgb([10, 20, 30], defaultAdjustments), [10, 20, 30]);
  assert.equal(hasAdjustments({ ...defaultAdjustments, brightness: 1 }), true);
});

test("layer color merging keeps weighted-RGB threshold behavior", () => {
  assert.deepEqual(
    mergeCloseLayerColors(["mard-h9", "mard-h9", "mard-h17"], completePalette, 1).cells,
    ["mard-h9", "mard-h9", "mard-h9"],
  );
  const separated = ["mard-h9", "mard-h9", "mard-p9"];
  assert.deepEqual(mergeCloseLayerColors(separated, completePalette, 1).cells, separated);
});
