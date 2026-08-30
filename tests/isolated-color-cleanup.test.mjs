import test from "node:test";
import assert from "node:assert/strict";
import { mergeIsolatedLayerColors } from "../generated/dist/src/imageAdjustments.js";

test("isolated color cleanup uses one immutable eight-neighbor majority pass", () => {
  const source = [
    "a", "a", "a",
    "a", "b", "a",
    "a", "a", "c",
  ];
  const result = mergeIsolatedLayerColors(source, 3, 3);
  assert.equal(result.changed, 2);
  assert.deepEqual(result.cells, Array(9).fill("a"));
  assert.equal(source[4], "b");
});

test("isolated cleanup preserves line ends, empty cells, and malformed grids", () => {
  const line = ["a", "b", null];
  assert.deepEqual(mergeIsolatedLayerColors(line, 3, 1), { cells: line, changed: 0 });
  assert.deepEqual(mergeIsolatedLayerColors(["a"], 2, 1), { cells: ["a"], changed: 0 });
});
