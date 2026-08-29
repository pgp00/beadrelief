import test from "node:test";
import assert from "node:assert/strict";

import {
  adjustRgb,
  defaultAdjustments,
  hasAdjustments,
} from "../generated/dist/src/imageAdjustments.js";

test("default image adjustments preserve RGB values", () => {
  assert.equal(hasAdjustments(defaultAdjustments), false);
  assert.deepEqual(adjustRgb([10, 20, 30], defaultAdjustments), [10, 20, 30]);
  assert.equal(hasAdjustments({ ...defaultAdjustments, brightness: 1 }), true);
});
