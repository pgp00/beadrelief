import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createProject, normalizeProject, withCells, withLayers, withMaterials } from "../generated/dist/src/project.js";
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
} from "../generated/dist/src/print/colors.js";

globalThis.React = React;
const { autoGenerationPaletteKey, beginAutoGenerationEffect, canEditLayer, codedUiError, generationBlocksExport, hasLayerCapacity, pendingGenerationAction, printOptionsForProject, projectForDisplay, projectGridChanged, replaceGeneratedProject, resizeWouldCropProject, shouldAutoRegenerate } = await import("../generated/dist/src/appLogic.js");
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

function renderPrintSettings(project, onChange, onCommit, language = "en", exportDisabled = false) {
  return PrintSettingsPanel({
    project,
    model: buildPrintableModel(composePrintableGrid(project)),
    errors: [],
    language,
    onChange,
    onCommit,
    onExport() {},
    exportDisabled,
  });
}

test("UI errors keep a stable code while localizing their message", () => {
  assert.equal(codedUiError("EXPORT_FAILED", "Could not export."), "[EXPORT_FAILED] Could not export.");
  assert.equal(codedUiError("EXPORT_FAILED", "无法导出。"), "[EXPORT_FAILED] 无法导出。");
});

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
  assert.equal(nearestPaletteColorOklab("#fefefe", palette).id, DEFAULT_AMS_COLORS[0].id);
  assert.equal(nearestPaletteColorOklab("#e3262e", palette).id, DEFAULT_AMS_COLORS[2].id);
  const selected = palette.slice(0, 2);
  const samples = ["#111111", "#eeeeee", "#777777"];
  const first = samples.map((sample) => nearestPaletteColorOklab(sample, selected).id);
  assert.deepEqual(samples.map((sample) => nearestPaletteColorOklab(sample, selected).id), first);
  assert.ok(first.every((id) => selected.some((color) => color.id === id)));
});

test("new projects start with white, black, and red while legacy slots are preserved", () => {
  const fresh = createProject(1, 1);
  assert.deepEqual(
    fresh.amsColors.map(({ name, hex }) => [name, hex]),
    [["White", "#f4f1e8"], ["Black", "#1c1c1c"], ["Red", "#ed2b2b"]],
  );
  assert.equal(fresh.printSettings.baseColorId, fresh.amsColors[0].id);

  const imported = {
    ...fresh,
    amsColors: [
      { id: "ams-1-010203", name: "One", hex: "#010203", tdMm: 1 },
      { id: "ams-2-040506", name: "Two", hex: "#040506", tdMm: 1 },
      { id: "ams-3-070809", name: "Three", hex: "#070809", tdMm: 1 },
      { id: "ams-4-0a0b0c", name: "Four", hex: "#0a0b0c", tdMm: 1 },
    ],
    printSettings: { ...fresh.printSettings, baseColorId: "ams-2-040506" },
  };
  const normalized = normalizeProject(imported);
  assert.deepEqual(normalized.amsColors, imported.amsColors);
  assert.equal(normalized.printSettings.baseColorId, "ams-2-040506");
});

test("projects missing AMS data receive the three new defaults", () => {
  const legacy = createProject(1, 1);
  delete legacy.amsColors;
  delete legacy.printSettings;
  const normalized = normalizeProject(legacy);
  assert.equal(normalized.amsColors.length, 3);
  assert.equal(normalized.printSettings.baseColorId, normalized.amsColors[0].id);
});

test("legacy AMS colors receive the default transmission distance", () => {
  const legacy = createProject(1, 1);
  legacy.amsColors = legacy.amsColors.map(({ tdMm, ...color }) => color);
  assert.ok(normalizeProject(legacy).amsColors.every((color) => color.tdMm === 1));
});

test("image conversion caps source pixels and treats the requested size as the long side", () => {
  assert.deepEqual(planImageConversion("image/jpeg", 6000, 3000, 60, 4, 8), {
    width: 60,
    height: 30,
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
  assert.throws(() => planImageConversion("image/webp", 10, 10, 8, 0, 1), /between one and 512/);
  assert.throws(() => planImageConversion("image/png", 10, 10, 8, 513, 16), /between one and 512/);
  assert.throws(() => planImageConversion("image/png", 10, 10, 8, 291, 513), /between one and 512/);
  assert.equal(planImageConversion("image/png", 10, 10, 180, 291, 291).maxColors, 291);
});

test("changing an AMS slot updates cells and the base reference", () => {
  const project = createProject(2, 1);
  const [first, second] = project.amsColors;
  const updated = withMaterials(
    withCells(project, [first.id, second.id]),
    project.amsColors.map((color, index) => index === 0 ? { ...color, id: "ams-1-333333", hex: "#333333" } : color),
  );
  assert.deepEqual(updated.layers[0].cells, ["ams-1-333333", second.id]);
  assert.deepEqual(updated.cells, ["ams-1-333333", second.id]);
  assert.equal(updated.printSettings.baseColorId, "ams-1-333333");
  assert.equal(project.layers[0].cells[0], null);
});

test("removing the last AMS slot maps its cells to the base slot", () => {
  const project = createProject(1, 1);
  const updated = withMaterials(
    withCells(project, [project.amsColors.at(-1).id]),
    project.amsColors.slice(0, -1),
  );
  assert.deepEqual(updated.cells, [project.amsColors[0].id]);
  assert.deepEqual(updated.layers[0].cells, updated.cells);
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

test("image generation replaces the project with one fresh layer", () => {
  const started = createProject(2, 2);
  const oldTopLayer = {
    ...started.layers[0],
    id: "old-top",
    name: "Old top layer",
    cells: [started.amsColors[2].id, null, null, null],
  };
  const latest = {
    ...withLayers(started, [started.layers[0], oldTopLayer], oldTopLayer.id),
    name: "Accepted name",
    amsColors: started.amsColors.map((color, index) => index === 1
      ? { ...color, name: "Accepted AMS", tdMm: 2 }
      : color),
    settings: { ...started.settings, showGrid: false, showActiveLayerOnly: true },
    layers: withLayers(started, [started.layers[0], oldTopLayer], oldTopLayer.id).layers.map((layer) => ({ ...layer, locked: true })),
  };
  const replaced = replaceGeneratedProject(latest, {
    width: 2,
    height: 1,
    cells: [latest.amsColors[0].id, latest.amsColors[1].id],
  });

  assert.equal(replaced.name, "Accepted name");
  assert.equal(replaced.amsColors[1].name, "Accepted AMS");
  assert.equal(replaced.amsColors[1].tdMm, 2);
  assert.equal(replaced.layers.length, 1);
  assert.equal(replaced.layers[0].id, "base");
  assert.equal(replaced.activeLayerId, "base");
  assert.equal(replaced.settings.showGrid, false);
  assert.equal(replaced.settings.showActiveLayerOnly, false);
  assert.deepEqual(replaced.layers[0].cells, [latest.amsColors[0].id, latest.amsColors[1].id]);
});

test("hidden or locked layers cannot be edited", () => {
  assert.equal(canEditLayer({ visible: true, locked: false }), true);
  assert.equal(canEditLayer({ visible: false, locked: false }), false);
  assert.equal(canEditLayer({ visible: true, locked: true }), false);
});

test("resize confirmation is needed only when nonempty cells would be cropped", () => {
  const project = createProject(3, 2);
  const top = { ...project.layers[0], id: "top", cells: [null, null, null, null, null, project.amsColors[1].id] };
  const layered = withLayers(project, [project.layers[0], top]);
  assert.equal(resizeWouldCropProject(layered, 2, 2), true);
  assert.equal(resizeWouldCropProject(layered, 3, 1), true);
  assert.equal(resizeWouldCropProject(layered, 3, 2), false);
  assert.equal(resizeWouldCropProject(createProject(3, 2), 2, 1), false);
});

test("every print output uses the persisted project name", () => {
  const project = { ...createProject(1, 1), name: "My persistent pattern" };
  assert.equal(printOptionsForProject(project, { format: "png", projectName: "stale nickname" }, "Layer").projectName, project.name);
  assert.equal(printOptionsForProject(project, { format: "pdf" }, "图层").layerLabelPrefix, "图层");
});

test("solo display derives visibility without changing the project", () => {
  const initial = createProject(2, 1);
  const top = {
    ...initial.layers[0],
    id: "top",
    name: "Top",
    visible: false,
    cells: [null, initial.amsColors[1].id],
  };
  const project = {
    ...withLayers(initial, [{ ...initial.layers[0], cells: [initial.amsColors[0].id, null] }, top], top.id),
    settings: { ...initial.settings, showActiveLayerOnly: true },
  };

  const displayed = projectForDisplay(project);
  assert.deepEqual(project.layers.map((layer) => layer.visible), [true, false]);
  assert.deepEqual(displayed.layers.map((layer) => layer.visible), [false, true]);
  assert.deepEqual(displayed.cells, [null, initial.amsColors[1].id]);

  const regular = { ...project, settings: { ...project.settings, showActiveLayerOnly: false } };
  assert.equal(projectForDisplay(regular), regular);
});

test("layer capacity stops at the project layer limit", () => {
  assert.equal(hasLayerCapacity(63), true);
  assert.equal(hasLayerCapacity(64), false);
  assert.equal(hasLayerCapacity(65), false);
});

test("scheduled and running generation both block export", () => {
  assert.equal(generationBlocksExport(false, false), false);
  assert.equal(generationBlocksExport(false, true), true);
  assert.equal(generationBlocksExport(true, false), true);
});

test("print settings clamp numeric input and can disable export while generating", () => {
  const project = createProject(1, 1);
  const changes = [];
  const render = (current = project, exportDisabled = false) => renderPrintSettings(current, (next) => changes.push(next), () => {}, "en", exportDisabled);
  const numberInputs = findElements(render(), (element) => element.type === "input" && element.props.type === "number");

  assert.equal(numberInputs.length, 7);
  numberInputs[0].props.onChange({ target: { value: "999" } });
  assert.equal(changes.at(-1).printSettings.cellPitchMm, 10);
  numberInputs[1].props.onChange({ target: { value: "-99" } });
  assert.equal(changes.at(-1).printSettings.baseThicknessMm, 0.4);
  numberInputs[2].props.onChange({ target: { value: "999" } });
  assert.equal(changes.at(-1).printSettings.beadHeightMm, 4);
  numberInputs[3].props.onChange({ target: { value: "999" } });
  assert.equal(changes.at(-1).printSettings.dimpleDiameterMm, 4.8);
  numberInputs[4].props.onChange({ target: { value: "999" } });
  assert.ok(Math.abs(changes.at(-1).printSettings.dimpleDepthMm - 0.6) < Number.EPSILON * 2);

  const exportButton = (tree) => findElements(tree, (element) => element.type === "button" && element.props.className === "primary print-export-button")[0];
  assert.equal(exportButton(render(project, false)).props.disabled, false);
  assert.equal(exportButton(render(project, true)).props.disabled, true);

  const layered = { ...project, printSettings: { ...project.printSettings, mode: "layered" } };
  const layeredInputs = findElements(render(layered), (element) => element.type === "input" && element.props.type === "number");
  layeredInputs.find((input) => Number(input.props.min) === 0.4).props.onChange({ target: { value: "5" } });
  assert.equal(changes.at(-1).printSettings.baseThicknessMm, 4.96);
});

test("continuous print-setting edits create one undo checkpoint per focus session", () => {
  const project = createProject(1, 1);
  const changes = [];
  let commits = 0;
  const tree = renderPrintSettings(project, (next) => changes.push(next), () => { commits += 1; });
  const color = findElements(tree, (element) => element.type === "input" && element.props.type === "color")[0];
  color.props.onFocus();
  color.props.onChange({ target: { value: "#123456" } });
  color.props.onChange({ target: { value: "#234567" } });
  assert.equal(commits, 1);

  const name = findElements(tree, (element) => element.type === "input" && element.props.type === "text")[0];
  name.props.onFocus();
  name.props.onChange({ target: { value: "Custom material" } });
  const number = findElements(tree, (element) => element.type === "input" && element.props.type === "number")[0];
  number.props.onFocus();
  number.props.onChange({ target: { value: "6" } });
  const baseColor = findElements(tree, (element) => element.type === "select")[0];
  baseColor.props.onFocus();
  baseColor.props.onChange({ target: { value: project.amsColors[1].id } });
  assert.equal(commits, 4);
  assert.equal(changes.at(-1).printSettings.baseColorId, project.amsColors[1].id);

  const layered = { ...project, printSettings: { ...project.printSettings, mode: "layered" } };
  const td = findElements(renderPrintSettings(layered, () => {}, () => { commits += 1; }), (element) => element.type === "input" && Number(element.props.min) === 0.01)[1];
  td.props.onFocus();
  td.props.onChange({ target: { value: "1.5" } });
  assert.equal(commits, 5);
});

test("first-use language and regeneration decisions are pure", () => {
  assert.equal(resolveLanguage("zh", "en-US"), "zh");
  assert.equal(resolveLanguage(null, "zh-CN"), "zh");
  assert.equal(resolveLanguage(null, "fr-FR"), "en");

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
  assert.equal(tdInputs.length, 3);
  assert.equal(tdInputs[0].props.disabled, true);
  assert.ok(tdInputs.slice(1).every((input) => !input.props.disabled));
  assert.deepEqual(tdInputs.map((input) => input.props["aria-label"]), ["AMS 1 TD (mm)", "AMS 2 TD (mm)", "AMS 3 TD (mm)"]);
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
