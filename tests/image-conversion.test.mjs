import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeImageMimeType,
  planImageCrop,
  planImageConversion,
  rgbaToBeads,
} from "../generated/dist/src/imageToBeads.js";

const colors = [
  { id: "black", primaryBrand: "MARD", primaryCode: "B", hex: "#000000", rgb: [0, 0, 0], codes: {}, group: "test", name: "Black" },
  { id: "gray", primaryBrand: "MARD", primaryCode: "G", hex: "#7f7f7f", rgb: [127, 127, 127], codes: {}, group: "test", name: "Gray" },
  { id: "white", primaryBrand: "MARD", primaryCode: "W", hex: "#ffffff", rgb: [255, 255, 255], codes: {}, group: "test", name: "White" },
];

function options(overrides = {}) {
  return {
    width: 1,
    maxColors: colors.length,
    palette: colors,
    backgroundMode: "keep",
    backgroundColor: [255, 255, 255],
    tolerance: 0,
    speckleReduction: 0,
    generationStyle: "cartoon",
    ...overrides,
  };
}

test("RGBA conversion preserves transparent cells and composites partial alpha", () => {
  assert.deepEqual(rgbaToBeads(new Uint8ClampedArray([255, 0, 0, 23]), 1, 1, 1, 1, options()).cells, [null]);
  assert.deepEqual(rgbaToBeads(new Uint8ClampedArray([0, 0, 0, 24]), 1, 1, 1, 1, options()).cells, ["white"]);
  assert.deepEqual(rgbaToBeads(new Uint8ClampedArray([0, 0, 0, 128]), 1, 1, 1, 1, options()).cells, ["gray"]);
  assert.deepEqual(rgbaToBeads(new Uint8ClampedArray([0, 0, 0, 254]), 1, 1, 1, 1, options()).cells, ["black"]);
});

test("keep retains white while remove-white drops detected white background", () => {
  const rgba = new Uint8ClampedArray([
    255, 255, 255, 255,
    0, 0, 0, 255,
    255, 255, 255, 255,
  ]);
  assert.deepEqual(rgbaToBeads(rgba, 3, 1, 3, 1, options()).cells, ["white", "black", "white"]);
  assert.deepEqual(rgbaToBeads(rgba, 3, 1, 3, 1, options({ backgroundMode: "remove-white" })).cells, [null, "black", null]);
});

test("conversion rejects non-finite numeric inputs", () => {
  assert.throws(() => planImageConversion("image/png", 10, 10, Number.NaN, 3, 3), /between one and 512/);
  assert.throws(() => planImageConversion("image/png", 10, 10, 10, 3, Number.NaN), /between one and 512/);
  assert.throws(
    () => rgbaToBeads(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1, 1, 1, options({ tolerance: Number.NaN })),
    /finite/,
  );
});

test("conversion rejects background channels outside byte range", () => {
  assert.throws(
    () => rgbaToBeads(new Uint8ClampedArray([0, 0, 0, 128]), 1, 1, 1, 1, options({ backgroundColor: [256, 0, 0] })),
    /finite|between 0 and 255/,
  );
  assert.throws(
    () => rgbaToBeads(new Uint8ClampedArray([0, 0, 0, 128]), 1, 1, 1, 1, options({ backgroundColor: [-1, 0, 0] })),
    /finite|between 0 and 255/,
  );
});

test("image/jpg normalizes to JPEG and unsupported MIME types fail", () => {
  assert.equal(normalizeImageMimeType("image/jpg"), "image/jpeg");
  assert.equal(normalizeImageMimeType("IMAGE/JPEG"), "image/jpeg");
  assert.equal(planImageConversion("image/jpg", 10, 10, 8, 3, 3).width, 8);
  assert.throws(() => normalizeImageMimeType("image/gif"), /JPG, PNG, or WebP/);
});

test("crop planning preserves the source and supports aspect, zoom, and framing", () => {
  assert.deepEqual(planImageCrop(1200, 800), { x: 0, y: 0, width: 1200, height: 800 });
  assert.deepEqual(planImageCrop(1200, 800, { aspect: "square", zoom: 1, offsetX: 0, offsetY: 0 }), {
    x: 200,
    y: 0,
    width: 800,
    height: 800,
  });
  assert.deepEqual(planImageCrop(1200, 800, { aspect: "square", zoom: 2, offsetX: 1, offsetY: -1 }), {
    x: 800,
    y: 0,
    width: 400,
    height: 400,
  });
  assert.throws(() => planImageCrop(1200, 800, { aspect: "square", zoom: 0, offsetX: 0, offsetY: 0 }), /crop/);
});

test("speckle cleanup preserves a strong black-white boundary", () => {
  const rgba = new Uint8ClampedArray(8 * 8 * 4);
  for (let index = 0; index < 64; index += 1) {
    const rgb = index % 8 < 4 ? [0, 0, 0] : [255, 255, 255];
    rgba.set([...rgb, 255], index * 4);
  }
  const result = rgbaToBeads(rgba, 8, 8, 8, 8, options({
    maxColors: 2,
    palette: [colors[0], colors[2]],
    speckleReduction: 1,
  }));
  assert.deepEqual(result.cells.slice(0, 8), [
    "black", "black", "black", "black",
    "white", "white", "white", "white",
  ]);
  assert.equal(new Set(result.cells).size, 2);
});

test("limited-color conversion keeps exact candidates without cleanup", () => {
  const rgba = new Uint8ClampedArray([
    0, 0, 0, 255,
    127, 127, 127, 255,
    255, 255, 255, 255,
  ]);
  const result = rgbaToBeads(rgba, 3, 1, 3, 1, options({
    maxColors: 2,
    speckleReduction: 0,
  }));
  assert.deepEqual(result.cells, ["black", "gray", "gray"]);
});

test("repeated, gradient, and partial-alpha pixels keep exact conversion output", () => {
  const repeated = new Uint8ClampedArray([...Array(16)].flatMap((_, i) => (i % 2 ? [127, 127, 127, 255] : [0, 0, 0, 255])));
  const gradient = new Uint8ClampedArray([...Array(16)].flatMap((_, i) => [i * 17, i * 17, i * 17, 255]));
  const partialAlpha = new Uint8ClampedArray([...Array(16)].flatMap((_, i) => [0, 0, 0, i % 4 === 0 ? 128 : 255]));
  const expected = [
    ["black", "gray", "black", "gray", "black", "gray", "black", "gray", "black", "gray", "black", "gray", "black", "gray", "black", "gray"],
    ["black", "black", "black", "gray", "gray", "gray", "gray", "gray", "gray", "gray", "gray", "gray", "white", "white", "white", "white"],
    ["gray", "black", "black", "black", "gray", "black", "black", "black", "gray", "black", "black", "black", "gray", "black", "black", "black"],
  ];
  [repeated, gradient, partialAlpha].forEach((pixels, index) => {
    [0, 1].forEach((speckleReduction) => {
      const result = rgbaToBeads(pixels, 4, 4, 4, 4, options({ generationStyle: "realistic", speckleReduction }));
      assert.deepEqual(result.cells, expected[index]);
      assert.equal(result.colorsUsed, index === 1 ? 3 : 2);
      assert.equal(result.totalBeads, 16);
      assert.ok(result.cells.every((id) => id === null || colors.some((color) => color.id === id)));
    });
  });
});

test("conversion-local matching does not mix palette or candidate sets", () => {
  const pixels = new Uint8ClampedArray([...Array(4)].flatMap((_, i) => (i % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255])));
  const alternate = [colors[2], colors[0]];
  assert.deepEqual(rgbaToBeads(pixels, 2, 2, 2, 2, options({ maxColors: 2 })).cells, ["black", "white", "black", "white"]);
  assert.deepEqual(rgbaToBeads(pixels, 2, 2, 2, 2, options({ palette: alternate, maxColors: 1 })).cells, ["black", "black", "black", "black"]);
  assert.deepEqual(rgbaToBeads(pixels, 2, 2, 2, 2, options({ maxColors: 1 })).cells, ["black", "black", "black", "black"]);
});
