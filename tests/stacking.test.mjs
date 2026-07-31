import test from "node:test";
import assert from "node:assert/strict";
import {
  STACK_LAYER_HEIGHT_MM,
  STACK_TEMPLATES,
  buildStackPalette,
  parseStackColorId,
  transmissionAtThickness,
} from "../generated/dist/src/print/stacking.js";

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
