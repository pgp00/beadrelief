import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createProject } from "../generated/dist/src/project.js";

globalThis.React = React;
const { ui } = await import("../generated/dist/src/i18n.js");
const { imageLaunchState, loadHeartSample } = await import("../generated/dist/src/App.js");

test("first-use launch copy and state stay localized", () => {
  assert.deepEqual(
    [ui.en.trySample, ui.en.uploadYourImage, ui.en.exportThreeMf],
    ["Try the sample", "Upload your image", "Export 3MF"],
  );
  assert.deepEqual(
    [ui.zh.trySample, ui.zh.uploadYourImage, ui.zh.exportThreeMf],
    ["试试示例", "上传你的图片", "导出 3MF"],
  );

  const empty = createProject(10, 10);
  assert.deepEqual(imageLaunchState(false, empty), {
    showActions: true,
    sampleSettings: {
      width: 10,
      generationStyle: "cartoon",
      backgroundMode: "keep",
      tolerance: 0,
    },
  });
  assert.equal(imageLaunchState(true, empty).showActions, false);

  const edited = createProject(10, 10);
  edited.layers[0].cells[0] = edited.amsColors[0].id;
  assert.equal(imageLaunchState(false, edited).showActions, false);
});

test("sample loading localizes fetch failures", async () => {
  await assert.rejects(
    loadHeartSample(async () => {
      throw new TypeError("Failed to fetch");
    }, ui.en.sampleLoadError),
    { message: ui.en.sampleLoadError },
  );
  await assert.rejects(
    loadHeartSample(async () => ({ ok: false }), ui.zh.sampleLoadError),
    { message: ui.zh.sampleLoadError },
  );
});
