import test from "node:test";
import assert from "node:assert/strict";

import {
  constrainToSquare,
  filledRectanglePoints,
  linePoints,
} from "../generated/dist/src/canvasGeometry.js";

test("canvas geometry keeps line endpoints and fills rectangles", () => {
  assert.deepEqual(linePoints(1, 2, 3, 4), [
    { x: 1, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 4 },
  ]);
  assert.equal(filledRectanglePoints(0, 0, 2, 1).length, 6);
  assert.deepEqual(constrainToSquare({ x: 3, y: 3 }, { x: 8, y: 5 }), { x: 5, y: 5 });
});
