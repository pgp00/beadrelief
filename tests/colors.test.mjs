import test from "node:test";
import assert from "node:assert/strict";
import { createProject, normalizeProject } from "../generated/dist/src/project.js";
import { planImageConversion } from "../generated/dist/src/imageToBeads.js";
import {
  DEFAULT_AMS_COLORS,
  amsColorToPaletteColor,
  makeAmsColorId,
  nearestPaletteColorOklab,
  paletteColorFromAmsId,
} from "../generated/dist/src/print/colors.js";

test("AMS ids embed their slot and current color", () => {
  assert.equal(makeAmsColorId(2, "#FF8040"), "ams-2-ff8040");
  const color = paletteColorFromAmsId("ams-2-ff8040");
  assert.equal(color?.id, "ams-2-ff8040");
  assert.equal(color?.name, "AMS 2");
  assert.equal(color?.hex, "#ff8040");
  assert.deepEqual(color?.rgb, [255, 128, 64]);
  assert.equal(paletteColorFromAmsId("mard-r01"), null);
});

test("OKLab matching is deterministic and stays inside the active palette", () => {
  const palette = DEFAULT_AMS_COLORS.map(amsColorToPaletteColor);
  assert.equal(nearestPaletteColorOklab("#fefefe", palette).id, "ams-2-f4f1e8");
  assert.equal(nearestPaletteColorOklab("#e3262e", palette).id, "ams-3-ed2b2b");
  const selected = palette.slice(0, 2);
  const samples = ["#111111", "#eeeeee", "#777777"];
  const first = samples.map((sample) => nearestPaletteColorOklab(sample, selected).id);
  assert.deepEqual(samples.map((sample) => nearestPaletteColorOklab(sample, selected).id), first);
  assert.ok(first.every((id) => selected.some((color) => color.id === id)));
});

test("legacy projects receive safe AMS and print defaults", () => {
  const legacy = createProject(1, 1);
  delete legacy.amsColors;
  delete legacy.printSettings;
  const normalized = normalizeProject(legacy);
  assert.equal(normalized.amsColors.length, 4);
  assert.equal(normalized.printSettings.baseColorId, normalized.amsColors[0].id);
});

test("image conversion caps source pixels and treats the requested size as the long side", () => {
  assert.deepEqual(planImageConversion("image/jpeg", 6000, 3000, 60, 4, 8), {
    width: 50,
    height: 25,
    sourceWidth: 4096,
    sourceHeight: 2048,
    maxColors: 4,
  });
  assert.deepEqual(planImageConversion("image/png", 1000, 2000, 32, 1, 4), {
    width: 16,
    height: 32,
    sourceWidth: 1000,
    sourceHeight: 2000,
    maxColors: 1,
  });
  assert.throws(() => planImageConversion("image/gif", 10, 10, 8, 1, 1), /JPG, PNG, or WebP/);
  assert.throws(() => planImageConversion("image/webp", 10, 10, 8, 0, 1), /one and four/);
});
