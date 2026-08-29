import type { ArrowKind } from "./types";

export function linePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const steps = Math.max(dx, dy, 1);
  for (let step = 0; step <= steps; step += 1) {
    points.push({
      x: Math.round(x0 + ((x1 - x0) * step) / steps),
      y: Math.round(y0 + ((y1 - y0) * step) / steps),
    });
  }
  return points;
}

export function rectanglePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const points: Array<{ x: number; y: number }> = [];
  for (let x = minX; x <= maxX; x += 1) {
    points.push({ x, y: minY }, { x, y: maxY });
  }
  for (let y = minY + 1; y < maxY; y += 1) {
    points.push({ x: minX, y }, { x: maxX, y });
  }
  return points;
}

export function filledRectanglePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const points: Array<{ x: number; y: number }> = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) points.push({ x, y });
  }
  return points;
}

export function constrainToSquare(start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const size = Math.max(0, Math.min(Math.abs(dx), Math.abs(dy)));
  return {
    x: start.x + Math.sign(dx || 1) * size,
    y: start.y + Math.sign(dy || 1) * size,
  };
}

export function ellipsePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 1 || height <= 1) return rectanglePoints(x0, y0, x1, y1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(1, Math.round(width / 2));
  const ry = Math.max(1, Math.round(height / 2));
  return midpointEllipsePoints(cx, cy, rx, ry);
}

export function circlePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const size = Math.min(maxX - minX, maxY - minY);
  if (size <= 1) return rectanglePoints(x0, y0, x1, y1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const radius = Math.max(1, Math.round(size / 2));
  return midpointCirclePoints(cx, cy, radius);
}

function midpointCirclePoints(cx: number, cy: number, radius: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  let x = radius;
  let y = 0;
  let decision = 1 - radius;
  while (x >= y) {
    pushSymmetricCirclePoints(points, cx, cy, x, y);
    y += 1;
    if (decision < 0) {
      decision += 2 * y + 1;
    } else {
      x -= 1;
      decision += 2 * (y - x) + 1;
    }
  }
  return points;
}

function midpointEllipsePoints(cx: number, cy: number, rx: number, ry: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  let x = 0;
  let y = ry;
  let px = 0;
  let py = 2 * rx2 * y;
  let p = ry2 - rx2 * ry + 0.25 * rx2;

  while (px < py) {
    pushSymmetricEllipsePoints(points, cx, cy, x, y);
    x += 1;
    px += 2 * ry2;
    if (p < 0) {
      p += ry2 + px;
    } else {
      y -= 1;
      py -= 2 * rx2;
      p += ry2 + px - py;
    }
  }

  p = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y >= 0) {
    pushSymmetricEllipsePoints(points, cx, cy, x, y);
    y -= 1;
    py -= 2 * rx2;
    if (p > 0) {
      p += rx2 - py;
    } else {
      x += 1;
      px += 2 * ry2;
      p += rx2 - py + px;
    }
  }

  return points;
}

function pushSymmetricCirclePoints(points: Array<{ x: number; y: number }>, cx: number, cy: number, x: number, y: number): void {
  points.push(
    { x: Math.round(cx + x), y: Math.round(cy + y) },
    { x: Math.round(cx + y), y: Math.round(cy + x) },
    { x: Math.round(cx - y), y: Math.round(cy + x) },
    { x: Math.round(cx - x), y: Math.round(cy + y) },
    { x: Math.round(cx - x), y: Math.round(cy - y) },
    { x: Math.round(cx - y), y: Math.round(cy - x) },
    { x: Math.round(cx + y), y: Math.round(cy - x) },
    { x: Math.round(cx + x), y: Math.round(cy - y) },
  );
}

function pushSymmetricEllipsePoints(points: Array<{ x: number; y: number }>, cx: number, cy: number, x: number, y: number): void {
  points.push(
    { x: Math.round(cx + x), y: Math.round(cy + y) },
    { x: Math.round(cx - x), y: Math.round(cy + y) },
    { x: Math.round(cx + x), y: Math.round(cy - y) },
    { x: Math.round(cx - x), y: Math.round(cy - y) },
  );
}

export function filledEllipsePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 1 || height <= 1) return filledRectanglePoints(x0, y0, x1, y1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(0.5, width / 2);
  const ry = Math.max(0.5, height / 2);
  const points: Array<{ x: number; y: number }> = [];
  const edgeBias = 1.02;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= edgeBias) points.push({ x, y });
    }
  }
  return points;
}

export function filledCirclePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const size = Math.min(maxX - minX, maxY - minY);
  if (size <= 1) return filledRectanglePoints(x0, y0, x1, y1);
  const cx = Math.round((minX + maxX) / 2);
  const cy = Math.round((minY + maxY) / 2);
  const radius = Math.max(1, Math.round(size / 2));
  const points: Array<{ x: number; y: number }> = [];
  const limit = (radius + 0.2) * (radius + 0.2);
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= limit) points.push({ x, y });
    }
  }
  return points;
}

export function trianglePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const vertices = triangleVertices(x0, y0, x1, y1);
  return [...linePoints(vertices.apex.x, vertices.apex.y, vertices.left.x, vertices.left.y), ...linePoints(vertices.left.x, vertices.left.y, vertices.right.x, vertices.right.y), ...linePoints(vertices.right.x, vertices.right.y, vertices.apex.x, vertices.apex.y)];
}

export function filledTrianglePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const vertices = triangleVertices(x0, y0, x1, y1);
  return [...filledPolygonPoints([vertices.apex, vertices.left, vertices.right]), ...polygonEdgePoints([vertices.apex, vertices.left, vertices.right])];
}

function triangleVertices(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { apex: { x: number; y: number }; left: { x: number; y: number }; right: { x: number; y: number } } {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const width = maxX - minX;
  const centerX = minX + Math.round(width / 2);
  return {
    apex: { x: centerX, y: minY },
    left: { x: minX, y: maxY },
    right: { x: maxX, y: maxY },
  };
}

export function arrowPoints(x0: number, y0: number, x1: number, y1: number, arrowKind: ArrowKind): Array<{ x: number; y: number }> {
  if (arrowKind === 'block') return blockArrowPoints(x0, y0, x1, y1);
  const stair = stairArrowPoints(x0, y0, x1, y1, arrowKind);
  if (stair) return stair;
  const shaft = linePoints(x0, y0, x1, y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const headLength = Math.max(2, Math.min(6, Math.round(length * 0.32)));
  const wing = Math.max(1, Math.round(headLength * 0.65));
  const baseX = Math.round(x1 - ux * headLength);
  const baseY = Math.round(y1 - uy * headLength);
  const perpX = -uy;
  const perpY = ux;
  return [
    ...shaft,
    ...linePoints(x1, y1, Math.round(baseX + perpX * wing), Math.round(baseY + perpY * wing)),
    ...linePoints(x1, y1, Math.round(baseX - perpX * wing), Math.round(baseY - perpY * wing)),
    ...(arrowKind === 'double'
      ? [
          ...linePoints(x0, y0, Math.round(x0 + ux * headLength + perpX * wing), Math.round(y0 + uy * headLength + perpY * wing)),
          ...linePoints(x0, y0, Math.round(x0 + ux * headLength - perpX * wing), Math.round(y0 + uy * headLength - perpY * wing)),
        ]
      : []),
  ];
}

function stairArrowPoints(x0: number, y0: number, x1: number, y1: number, arrowKind: ArrowKind): Array<{ x: number; y: number }> | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  if (length < 3) return null;
  const headSize = Math.max(2, Math.min(7, Math.round(length * 0.28)));
  if (Math.abs(dx) >= Math.abs(dy) * 2) {
    const dir = Math.sign(dx || 1);
    const centerY = Math.round((y0 + y1) / 2);
    const tipX = x1;
    const shaftStart = arrowKind === 'double' ? x0 + dir * headSize : x0;
    const shaftEnd = x1;
    const points = linePoints(shaftStart, centerY, shaftEnd, centerY);
    points.push(...stairArrowHeadPoints(tipX, centerY, dir, 0, headSize));
    if (arrowKind === 'double') points.push(...stairArrowHeadPoints(x0, centerY, -dir, 0, headSize));
    return points;
  }
  if (Math.abs(dy) >= Math.abs(dx) * 2) {
    const dir = Math.sign(dy || 1);
    const centerX = Math.round((x0 + x1) / 2);
    const tipY = y1;
    const shaftStart = arrowKind === 'double' ? y0 + dir * headSize : y0;
    const shaftEnd = y1;
    const points = linePoints(centerX, shaftStart, centerX, shaftEnd);
    points.push(...stairArrowHeadPoints(centerX, tipY, 0, dir, headSize));
    if (arrowKind === 'double') points.push(...stairArrowHeadPoints(centerX, y0, 0, -dir, headSize));
    return points;
  }
  return null;
}

function stairArrowHeadPoints(tipX: number, tipY: number, dirX: number, dirY: number, size: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let step = 0; step <= size; step += 1) {
    if (dirX !== 0) {
      points.push({ x: tipX - dirX * step, y: tipY - step }, { x: tipX - dirX * step, y: tipY + step });
    } else {
      points.push({ x: tipX - step, y: tipY - dirY * step }, { x: tipX + step, y: tipY - dirY * step });
    }
  }
  return points;
}

function blockArrowPoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const cardinal = cardinalBlockArrowPoints(x0, y0, x1, y1);
  if (cardinal) return cardinal;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const perpX = -uy;
  const perpY = ux;
  const thickness = Math.max(1, Math.round(length * 0.12));
  const headLength = Math.max(2, Math.min(8, Math.round(length * 0.34)));
  const headWidth = Math.max(thickness + 1, Math.round(length * 0.26));
  const shaftEnd = {
    x: x1 - ux * headLength,
    y: y1 - uy * headLength,
  };
  const shaft = [
    { x: x0 + perpX * thickness, y: y0 + perpY * thickness },
    { x: shaftEnd.x + perpX * thickness, y: shaftEnd.y + perpY * thickness },
    { x: shaftEnd.x - perpX * thickness, y: shaftEnd.y - perpY * thickness },
    { x: x0 - perpX * thickness, y: y0 - perpY * thickness },
  ];
  const head = [
    { x: x1, y: y1 },
    { x: shaftEnd.x + perpX * headWidth, y: shaftEnd.y + perpY * headWidth },
    { x: shaftEnd.x - perpX * headWidth, y: shaftEnd.y - perpY * headWidth },
  ];
  return [...filledPolygonPoints(shaft), ...filledPolygonPoints(head), ...polygonEdgePoints(shaft), ...polygonEdgePoints(head)];
}

function cardinalBlockArrowPoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  if (length < 4) return null;
  const thickness = Math.max(1, Math.round(length * 0.12));
  const headSize = Math.max(thickness + 2, Math.min(9, Math.round(length * 0.28)));
  const points: Array<{ x: number; y: number }> = [];
  if (Math.abs(dx) >= Math.abs(dy) * 2) {
    const dir = Math.sign(dx || 1);
    const centerY = Math.round((y0 + y1) / 2);
    const shaftEnd = x1 - dir * headSize;
    for (let y = centerY - thickness; y <= centerY + thickness; y += 1) {
      const from = Math.min(x0, shaftEnd);
      const to = Math.max(x0, shaftEnd);
      for (let x = from; x <= to; x += 1) points.push({ x, y });
    }
    for (let offset = -headSize; offset <= headSize; offset += 1) {
      const baseX = x1 - dir * headSize;
      const edgeX = x1 - dir * Math.abs(offset);
      const from = Math.min(baseX, edgeX);
      const to = Math.max(baseX, edgeX);
      for (let x = from; x <= to; x += 1) points.push({ x, y: centerY + offset });
    }
    return points;
  }
  if (Math.abs(dy) >= Math.abs(dx) * 2) {
    const dir = Math.sign(dy || 1);
    const centerX = Math.round((x0 + x1) / 2);
    const shaftEnd = y1 - dir * headSize;
    for (let x = centerX - thickness; x <= centerX + thickness; x += 1) {
      const from = Math.min(y0, shaftEnd);
      const to = Math.max(y0, shaftEnd);
      for (let y = from; y <= to; y += 1) points.push({ x, y });
    }
    for (let offset = -headSize; offset <= headSize; offset += 1) {
      const baseY = y1 - dir * headSize;
      const edgeY = y1 - dir * Math.abs(offset);
      const from = Math.min(baseY, edgeY);
      const to = Math.max(baseY, edgeY);
      for (let y = from; y <= to; y += 1) points.push({ x: centerX + offset, y });
    }
    return points;
  }
  return null;
}

function filledPolygonPoints(vertices: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const minX = Math.floor(Math.min(...vertices.map((point) => point.x)));
  const maxX = Math.ceil(Math.max(...vertices.map((point) => point.x)));
  const minY = Math.floor(Math.min(...vertices.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...vertices.map((point) => point.y)));
  const points: Array<{ x: number; y: number }> = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x, y, vertices)) points.push({ x, y });
    }
  }
  return points;
}

function polygonEdgePoints(vertices: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  vertices.forEach((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    points.push(...linePoints(Math.round(point.x), Math.round(point.y), Math.round(next.x), Math.round(next.y)));
  });
  return points;
}

function pointInPolygon(x: number, y: number, vertices: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const a = vertices[i];
    const b = vertices[j];
    const intersects = a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
