import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { createProject } from "../generated/dist/src/project.js";

globalThis.React = React;
const { ui } = await import("../generated/dist/src/i18n.js");
const { imageLaunchState, loadHeartSample } = await import("../generated/dist/src/appLogic.js");

test("first-use launch and export copy stay localized", () => {
  for (const key of ["threeMfDownloaded", "trySample", "uploadYourImage", "exportThreeMf"]) {
    assert.notEqual(ui.en[key], ui.zh[key]);
  }
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
  const indexHtml = await readFile("index.html", "utf8");

  assert.equal(packageJson.name, "beadrelief");
  assert.equal(packageJson.homepage, "https://pgp00.github.io/beadrelief/");
  assert.equal(packageJson.repository.url, "https://github.com/pgp00/beadrelief.git");
  assert.equal(ui.en.appName, "BeadRelief");
  assert.equal(ui.zh.appName, "BeadRelief");
  assert.match(indexHtml, /property="og:title"/);
  assert.match(indexHtml, /name="twitter:card"/);
  assert.match(indexHtml, /href="\.\/beadrelief-icon\.svg"/);
});
