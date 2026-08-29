import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { createProject } from "../generated/dist/src/project.js";

globalThis.React = React;
const { ui } = await import("../generated/dist/src/i18n.js");
const { imageLaunchState, loadHeartSample } = await import("../generated/dist/src/App.js");

test("first-use launch and export copy stay localized", async () => {
  const source = await readFile("src/App.tsx", "utf8");
  assert.match(source, /Bambu project-filament colors and part assignments included/);
  assert.match(source, /已包含 Bambu 项目耗材颜色和零件分配/);
  assert.match(source, /confirm.*AMS/i);
  assert.match(source, /确认.*AMS/);
  assert.equal(
    ui.en.threeMfDownloaded,
    "3MF exported with Bambu project-filament colors and part assignments included; confirm the physical AMS slots before printing.",
  );
  assert.equal(
    ui.zh.threeMfDownloaded,
    "3MF 已导出，已包含 Bambu 项目耗材颜色和零件分配；打印前请确认实际 AMS 槽位。",
  );

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

test("public identity stays BeadRelief", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const source = await readFile("src/App.tsx", "utf8");

  assert.equal(packageJson.name, "beadrelief");
  assert.equal(packageJson.homepage, "https://pgp00.github.io/beadrelief/");
  assert.equal(packageJson.repository.url, "https://github.com/pgp00/beadrelief.git");
  assert.equal(ui.en.appName, "BeadRelief");
  assert.equal(ui.zh.appName, "BeadRelief");
  assert.match(source, /https:\/\/github\.com\/pgp00\/beadrelief/);
});
