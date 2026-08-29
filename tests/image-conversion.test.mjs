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
