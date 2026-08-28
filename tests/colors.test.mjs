import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import * as projectApi from "../generated/dist/src/project.js";
import { planImageConversion } from "../generated/dist/src/imageToBeads.js";
import PrintSettingsPanel from "../generated/dist/src/PrintSettingsPanel.js";
import { buildPrintableModel, composePrintableGrid } from "../generated/dist/src/print/model.js";
import { buildStackPalette, parseStackColorId } from "../generated/dist/src/print/stacking.js";
import {
  DEFAULT_AMS_COLORS,
  amsColorToPaletteColor,
  makeAmsColorId,
  nearestPaletteColorOklab,
  paletteColorFromAmsId,
  replaceProjectColor,
} from "../generated/dist/src/print/colors.js";

const { createProject, hasEditableWork, normalizeProject, withCells } = projectApi;
globalThis.React = React;
const { autoGenerationPaletteKey, beginAutoGenerationEffect, pendingGenerationAction, projectGridChanged, shouldAutoRegenerate } = await import("../generated/dist/src/App.js");
const { resolveLanguage } = await import("../generated/dist/src/i18n.js");

function findElements(element, predicate, found = []) {
  if (!element || typeof element !== "object") return found;
  if (predicate(element)) found.push(element);
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    findElements(child, predicate, found);
  }
  return found;
}

function renderPrintSettings(project, onChange, onCommit, language = "en") {
  return PrintSettingsPanel({
    project,
    model: buildPrintableModel(composePrintableGrid(project)),
    errors: [],
    language,
    onChange,
    onCommit,
    onExport() {},
  });
}

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
  assert.equal(normalized.printSettings.mode, "solid");
  assert.ok(normalized.amsColors.every((color) => color.tdMm === 1));
});

test("legacy AMS colors receive the default transmission distance", () => {
  const legacy = createProject(1, 1);
  legacy.amsColors = legacy.amsColors.map(({ tdMm, ...color }) => color);
  assert.ok(normalizeProject(legacy).amsColors.every((color) => color.tdMm === 1));
});

test("project imports reject unsafe allocation shapes", () => {
  const project = createProject(1, 1);
  assert.equal(typeof projectApi.isSafeProjectImport, "function");
  assert.equal(projectApi.isSafeProjectImport({ ...project, width: 1.5 }, 100), false);
  assert.equal(projectApi.isSafeProjectImport({ ...project, width: 51 }, 100), false);
  assert.equal(projectApi.isSafeProjectImport({ ...project, layers: Array.from({ length: 65 }, () => project.layers[0]) }, 100), false);
  assert.equal(projectApi.isSafeProjectImport(project, projectApi.MAX_PROJECT_FILE_BYTES + 1), false);
  assert.equal(normalizeProject({ ...project, width: 1.5 }).width, 32);
  assert.equal(normalizeProject({ ...project, width: 51 }).width, 32);
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
  assert.deepEqual(planImageConversion("image/png", 1200, 800, 32, 13, 13), {
    width: 32,
    height: 21,
    sourceWidth: 1200,
    sourceHeight: 800,
    maxColors: 13,
  });
  assert.throws(() => planImageConversion("image/gif", 10, 10, 8, 1, 1), /JPG, PNG, or WebP/);
  assert.throws(() => planImageConversion("image/webp", 10, 10, 8, 0, 1), /one and sixteen/);
  assert.throws(() => planImageConversion("image/png", 10, 10, 8, 17, 17), /sixteen/);
});

test("changing an AMS slot updates cells and the base reference", () => {
  const project = withCells(createProject(2, 1), ["ams-1-1c1c1c", "ams-2-f4f1e8"]);
  const updated = replaceProjectColor(project, "ams-1-1c1c1c", "ams-1-333333");
  assert.deepEqual(updated.layers[0].cells, ["ams-1-333333", "ams-2-f4f1e8"]);
  assert.deepEqual(updated.cells, ["ams-1-333333", "ams-2-f4f1e8"]);
  assert.equal(updated.printSettings.baseColorId, "ams-1-333333");
  assert.equal(project.layers[0].cells[0], "ams-1-1c1c1c");
});

test("automatic image generation keys ignore layered material edits only", () => {
  const project = createProject(1, 1);
  const renamed = project.amsColors.map((color, index) => index === 1 ? { ...color, name: "Edited" } : color);
  const recalibrated = project.amsColors.map((color, index) => index === 1 ? { ...color, tdMm: 2 } : color);
  const recolored = project.amsColors.map((color, index) => index === 1 ? { ...color, hex: "#123456" } : color);
  assert.equal(autoGenerationPaletteKey("solid", project.amsColors), autoGenerationPaletteKey("solid", renamed));
  assert.equal(autoGenerationPaletteKey("solid", project.amsColors), autoGenerationPaletteKey("solid", recalibrated));
  assert.notEqual(autoGenerationPaletteKey("solid", project.amsColors), autoGenerationPaletteKey("solid", recolored));
  assert.notEqual(autoGenerationPaletteKey("solid", project.amsColors), autoGenerationPaletteKey("layered", project.amsColors));
});

test("first-use language and replacement decisions are pure", () => {
  assert.equal(resolveLanguage("zh", "en-US"), "zh");
  assert.equal(resolveLanguage(null, "zh-CN"), "zh");
  assert.equal(resolveLanguage(null, "fr-FR"), "en");

  assert.equal(hasEditableWork(createProject(10, 10)), false);
  const edited = createProject(10, 10);
  edited.layers[0].cells[0] = edited.amsColors[0].id;
  assert.equal(hasEditableWork(edited), true);

  assert.equal(shouldAutoRegenerate(true, false), true);
  assert.equal(shouldAutoRegenerate(true, true), false);
});

test("grid-change tracking ignores material and display metadata", () => {
  const project = createProject(2, 2);
  assert.equal(projectGridChanged(project, { ...project, name: "Renamed" }), false);
  assert.equal(projectGridChanged(project, {
    ...project,
    amsColors: project.amsColors.map((color, index) => index === 1 ? { ...color, name: "Edited", tdMm: 2 } : color),
  }), false);
  assert.equal(projectGridChanged(project, {
    ...project,
    settings: { ...project.settings, showGrid: !project.settings.showGrid },
  }), false);
  assert.equal(projectGridChanged(project, {
    ...project,
    layers: project.layers.map((layer) => ({ ...layer, visible: false })),
    cells: Array(4).fill(null),
  }), false);
  assert.equal(projectGridChanged(project, withCells(project, [project.amsColors[0].id, null, null, null])), true);
  assert.equal(projectGridChanged(project, { ...project, width: 3, cells: Array(6).fill(null), layers: project.layers.map((layer) => ({ ...layer, cells: Array(6).fill(null) })) }), true);
});

test("automatic image generation invalidates immediately and consumes suppression once", () => {
  const request = { current: 7 };
  const suppression = { current: false };
  assert.equal(beginAutoGenerationEffect(request, suppression), true);
  assert.equal(request.current, 8);
  suppression.current = true;
  assert.equal(beginAutoGenerationEffect(request, suppression), false);
  assert.equal(request.current, 9);
  assert.equal(suppression.current, false);
  assert.equal(beginAutoGenerationEffect(request, suppression), true);
});

test("pending image generation restarts unless history restoration suppresses it", () => {
  assert.equal(pendingGenerationAction(false, false), "none");
  assert.equal(pendingGenerationAction(true, false), "restart");
  assert.equal(pendingGenerationAction(true, true), "cancel");
});

test("layered print controls select modes, templates, and TD without losing stack stops", () => {
  const initial = createProject(1, 1);
  const solid = withCells(initial, [initial.amsColors[1].id]);
  const changes = [];
  let commits = 0;
  const onChange = (project) => changes.push(project);
  const onCommit = () => { commits += 1; };

  const solidInputs = findElements(renderPrintSettings(solid, onChange, onCommit), (element) => element.type === "input" && element.props.type === "radio");
  assert.equal(solidInputs.find((input) => input.props.checked)?.props.disabled, undefined);
  const layeredInput = solidInputs.find((input) => !input.props.checked);
  assert.ok(layeredInput);
  layeredInput.props.onChange();
  const layered = changes.at(-1);
  assert.equal(commits, 1);
  assert.equal(layered.printSettings.mode, "layered");

  const layeredTree = renderPrintSettings(layered, onChange, onCommit);
  const templates = findElements(layeredTree, (element) => element.type === "button" && ["CMYW", "RYBW"].includes(element.props.children));
  const tdInputs = findElements(layeredTree, (element) => element.type === "input" && element.props.type === "number" && Number(element.props.min) === 0.01);
  assert.equal(tdInputs.length, 4);
  assert.equal(tdInputs[0].props.disabled, true);
  assert.ok(tdInputs.slice(1).every((input) => !input.props.disabled));
  assert.deepEqual(tdInputs.map((input) => input.props["aria-label"]), ["AMS 1 TD (mm)", "AMS 2 TD (mm)", "AMS 3 TD (mm)", "AMS 4 TD (mm)"]);
  const opaqueHint = findElements(layeredTree, (element) => element.type === "small" && element.props.className === "ams-td-base-hint");
  assert.equal(opaqueHint[0]?.props.children, "Treated as opaque; TD ignored.");
  const zhHint = findElements(renderPrintSettings(layered, onChange, onCommit, "zh"), (element) => element.type === "small" && element.props.className === "ams-td-base-hint");
  assert.equal(zhHint[0]?.props.children, "按不透光处理；忽略 TD。");
  assert.equal(templates.length, 2);
  templates.find((button) => button.props.children === "RYBW").props.onClick();
  const templated = changes.at(-1);
  const palette = buildStackPalette(templated.amsColors);
  assert.deepEqual(palette.map((color) => color.primaryCode), Array.from({ length: 13 }, (_, index) => `L${index + 4}`));

  const selectedStop = withCells(templated, [palette[4].id]);
  const tdInput = findElements(renderPrintSettings(selectedStop, onChange, onCommit), (element) => element.type === "input" && element.props.type === "number" && Number(element.props.min) === 0.01)[1];
  tdInput.props.onChange({ target: { value: "1.5" } });
  const recalibrated = changes.at(-1);
  assert.equal(commits, 2);
  assert.equal(parseStackColorId(recalibrated.layers[0].cells[0]).stopLevel, 8);
  assert.notEqual(recalibrated.layers[0].cells[0], selectedStop.layers[0].cells[0]);

  const solidInput = findElements(renderPrintSettings(recalibrated, onChange, onCommit), (element) => element.type === "input" && element.props.type === "radio" && element.props.checked === false)[0];
  solidInput.props.onChange();
  assert.equal(changes.at(-1).printSettings.mode, "solid");
});
