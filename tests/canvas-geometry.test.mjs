import test from "node:test";
import assert from "node:assert/strict";

import {
  circlePoints,
  constrainToSquare,
  ellipsePoints,
  filledCirclePoints,
  filledEllipsePoints,
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

test("round shapes stay inside odd-sized drag bounds", () => {
  const ellipse = ellipsePoints(0, 0, 5, 3);
  const circle = circlePoints(0, 0, 5, 5);
  for (const [points, maxX, maxY] of [
    [ellipse, 5, 3],
    [filledEllipsePoints(0, 0, 5, 3), 5, 3],
    [circle, 5, 5],
    [filledCirclePoints(0, 0, 5, 5), 5, 5],
  ]) {
    assert.ok(points.length > 0);
    assert.ok(points.every(({ x, y }) => x >= 0 && x <= maxX && y >= 0 && y <= maxY));
  }
  assert.deepEqual([Math.min(...ellipse.map(({ x }) => x)), Math.max(...ellipse.map(({ x }) => x)), Math.min(...ellipse.map(({ y }) => y)), Math.max(...ellipse.map(({ y }) => y))], [0, 5, 0, 3]);
  assert.deepEqual([Math.min(...circle.map(({ x }) => x)), Math.max(...circle.map(({ x }) => x)), Math.min(...circle.map(({ y }) => y)), Math.max(...circle.map(({ y }) => y))], [0, 5, 0, 5]);
});
