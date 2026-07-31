# Pingdou Filament-Painting Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional four-filament, HueForge-style layered-color mode that gives a P2S + AMS more than four perceived colors while retaining fused round beads, predicted previews, and a sliceable grouped 3MF.

**Architecture:** A pure `stacking.ts` module generates a thirteen-color stop-height palette from two to four physical filaments and their TD values. The existing editor stores printable `stack-<level>-<hex>` IDs, while a discriminated printable-grid branch converts stop levels into four non-overlapping Z material bands; 3MF continues exporting only physical materials. Three.js renders the exact band geometry plus non-exported predicted-color top overlays.

**Tech Stack:** React 18, TypeScript 5, Three.js, Canvas API, Node's built-in test runner, standard 3MF XML/ZIP, Bambu Studio 02.07.01.62 with the P2S 0.4 mm profile.

## Global Constraints

- Preserve current solid-color project and 3MF behavior.
- Use two to four PLA filaments in layered mode and no more than four physical material IDs.
- Use a fixed `0.08 mm` stack layer height and four layers per filament.
- In layered mode require base thickness to be an integer multiple of `0.08 mm`; slice with a `0.16 mm` initial layer and `0.08 mm` remaining layers.
- Four filaments must generate exactly thirteen candidate stop colors at levels `4..16`.
- Treat AMS list order as bottom-to-top stack order; AMS 1 is the base.
- At every non-boundary Z interval, only one physical material may exist anywhere in the model.
- Four used bands require at most three global AMS changes; do not use Bambu Mixed Filament metadata.
- Keep round fused-bead footprints, top bevels, and a one-layer (`0.08 mm`) dimple in layered mode.
- Keep X and Y within the existing `250 mm` P2S safety limit.
- Label optical colors as estimates; TD is user-adjustable and templates are not calibrated claims.
- Add no runtime dependency, cloud service, account, printer upload, or proprietary HueForge format.
- Use existing OKLab matching, project history, standard 3MF exporter, and framework-free Node tests.

---

## File map

- Create `src/print/stacking.ts`: stack constants, templates, TD transmission, predicted palette, and stack-ID parsing.
- Modify `src/types.ts`: `PrintMode`, `AmsColor.tdMm`, `PrintSettings.mode`, and layered usage row.
- Modify `src/print/colors.ts`: TD-bearing defaults and shared RGB helpers only.
- Modify `src/palette.ts`: resolve generated `stack-*` colors.
- Modify `src/print/settings.ts`: default old and new projects to solid mode.
- Modify `src/project.ts`: normalize TD/mode and remap cells during mode, template, or layered-material changes.
- Modify `src/usage.ts`: estimate physical filament layer-cells without replacing existing bead usage.
- Modify `src/imageToBeads.ts`: permit the generated thirteen-color palette.
- Modify `src/print/geometry.ts`: append closed bead Z sections and preview-only top surfaces.
- Modify `src/print/model.ts`: branch solid versus layered grids and emit material bands plus preview overlays.
- Modify `src/print/validation.ts`: validate TD and disjoint layered material intervals.
- Modify `src/ThreePreview.tsx`: render predicted top overlays without exporting them.
- Modify `src/PrintSettingsPanel.tsx`: mode, templates, stack order, TD, and fixed-layer explanation.
- Modify `src/App.tsx`: use the generated palette, regenerate/remap, and show layered usage/summary copy.
- Modify `src/styles.css`: style the minimal new controls.
- Create `tests/stacking.test.mjs`: optical, migration, remap, and physical-usage checks.
- Modify `tests/colors.test.mjs`, `tests/model.test.mjs`, `tests/geometry.test.mjs`, `tests/preview.test.mjs`, and `tests/three-mf.test.mjs`.
- Create `scripts/generate-layered-sample.mjs` and `samples/pingdou-p2s-layered-sample.3mf`.
- Modify `package.json`, `README.md`, and `docs/verification/bambu-studio-p2s.md`.

---

### Task 1: Deterministic TD stack palette

**Files:**

- Create: `src/print/stacking.ts`
- Modify: `src/types.ts:62-75`
- Modify: `src/print/colors.ts:1-45`
- Modify: `src/palette.ts:1-3,350-353`
- Modify: `src/print/settings.ts:1-12`
- Modify: `tests/colors.test.mjs:1-70`
- Create: `tests/stacking.test.mjs`

**Interfaces:**

- Produces: `STACK_LAYER_HEIGHT_MM`, `STACK_LAYERS_PER_FILAMENT`, `STACK_TEMPLATES`, `buildStackPalette(materials)`, `parseStackColorId(id)`, `paletteColorFromStackId(id)`, and `transmissionAtThickness(thicknessMm, tdMm)`.
- Produces: `PrintMode = 'solid' | 'layered'`, `AmsColor.tdMm`, and `PrintSettings.mode`.
- Consumes: existing `PaletteColor`, `normalizeHex`, and OKLab matching in later tasks.

- [ ] **Step 1: Write failing palette tests**

Create `tests/stacking.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  STACK_LAYER_HEIGHT_MM,
  STACK_TEMPLATES,
  buildStackPalette,
  parseStackColorId,
  transmissionAtThickness,
} from "../generated/dist/src/print/stacking.js";

test("one TD leaves five percent transmission", () => {
  assert.equal(STACK_LAYER_HEIGHT_MM, 0.08);
  assert.ok(Math.abs(transmissionAtThickness(1.25, 1.25) - 0.05) < 1e-12);
});

test("four filaments create thirteen ordered printable stop colors", () => {
  const palette = buildStackPalette(STACK_TEMPLATES.rybw);
  assert.equal(palette.length, 13);
  assert.deepEqual(palette.map((color) => color.stopLevel), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.ok(new Set(palette.map((color) => color.hex)).size > 4);
  assert.deepEqual(parseStackColorId(palette[8].id), { stopLevel: 12, hex: palette[8].hex });
  assert.equal(parseStackColorId("stack-bad"), null);
});
```

Extend the existing legacy-default test in `tests/colors.test.mjs`:

```js
assert.equal(normalized.printSettings.mode, "solid");
assert.ok(normalized.amsColors.every((color) => color.tdMm === 1));
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
npm run build
node --test tests/stacking.test.mjs tests/colors.test.mjs
```

Expected: build fails because `print/stacking.ts`, `PrintSettings.mode`, and `AmsColor.tdMm` do not exist.

- [ ] **Step 3: Add the minimal types, constants, templates, and optical model**

Change the print types in `src/types.ts` to:

```ts
export type PrintMode = 'solid' | 'layered';

export type AmsColor = {
  id: string;
  name: string;
  hex: string;
  tdMm: number;
};

export type PrintSettings = {
  cellPitchMm: number;
  baseThicknessMm: number;
  beadHeightMm: number;
  dimpleDiameterMm: number;
  dimpleDepthMm: number;
  baseColorId: string;
  mode: PrintMode;
};
```

Add `mode: 'solid'` to `DEFAULT_PRINT_SETTINGS` and add `tdMm: 1` to each `DEFAULT_AMS_COLORS` entry.

Create `src/print/stacking.ts` with the complete pure implementation:

```ts
import type { AmsColor, PaletteColor } from '../types';
import { makeAmsColorId, normalizeHex } from './colors';

export const STACK_LAYER_HEIGHT_MM = 0.08;
export const STACK_LAYERS_PER_FILAMENT = 4;

export type StackTemplateId = 'cmyw' | 'rybw';
export type StackPaletteColor = PaletteColor & {
  stopLevel: number;
  materialIndex: number;
};

function material(slot: number, name: string, hex: string): AmsColor {
  return { id: makeAmsColorId(slot, hex), name, hex: normalizeHex(hex), tdMm: 1 };
}

export const STACK_TEMPLATES: Record<StackTemplateId, AmsColor[]> = {
  cmyw: [
    material(1, 'Bambu PLA Basic Cyan', '#00aeef'),
    material(2, 'Bambu PLA Basic Magenta', '#ec008c'),
    material(3, 'Bambu PLA Basic Yellow', '#f4ee2a'),
    material(4, 'Bambu PLA Basic White', '#ffffff'),
  ],
  rybw: [
    material(1, 'Bambu PLA Basic Blue', '#0a2989'),
    material(2, 'Bambu PLA Basic Red', '#c12e1f'),
    material(3, 'Bambu PLA Basic Yellow', '#f4ee2a'),
    material(4, 'Bambu PLA Basic White', '#ffffff'),
  ],
};

export function transmissionAtThickness(thicknessMm: number, tdMm: number): number {
  if (!Number.isFinite(thicknessMm) || thicknessMm < 0) throw new Error('Thickness must be zero or positive.');
  if (!Number.isFinite(tdMm) || tdMm <= 0) throw new Error('TD must be positive.');
  return 0.05 ** (thicknessMm / tdMm);
}

export function makeStackColorId(stopLevel: number, hex: string): string {
  if (!Number.isInteger(stopLevel) || stopLevel < STACK_LAYERS_PER_FILAMENT || stopLevel > 99) {
    throw new Error(`Invalid stack stop level: ${stopLevel}`);
  }
  return `stack-${String(stopLevel).padStart(2, '0')}-${normalizeHex(hex).slice(1)}`;
}

export function parseStackColorId(id: string): { stopLevel: number; hex: string } | null {
  const match = /^stack-(\d{2})-([0-9a-f]{6})$/.exec(id);
  if (!match) return null;
  return { stopLevel: Number(match[1]), hex: `#${match[2]}` };
}

export function paletteColorFromStackId(id: string): PaletteColor | null {
  const parsed = parseStackColorId(id);
  return parsed ? toPaletteColor(parsed.stopLevel, -1, `Layer ${parsed.stopLevel}`, parsed.hex) : null;
}

export function buildStackPalette(materials: AmsColor[]): StackPaletteColor[] {
  if (materials.length < 2 || materials.length > 4) throw new Error('Layered mode needs two to four filaments.');
  const result: StackPaletteColor[] = [];
  let under = hexToRgb(materials[0].hex);
  result.push(toPaletteColor(4, 0, materials[0].name, rgbToHex(under)));
  for (let materialIndex = 1; materialIndex < materials.length; materialIndex += 1) {
    const over = hexToRgb(materials[materialIndex].hex);
    const bandUnder = under;
    for (let layer = 1; layer <= STACK_LAYERS_PER_FILAMENT; layer += 1) {
      const stopLevel = materialIndex * STACK_LAYERS_PER_FILAMENT + layer;
      const thickness = layer * STACK_LAYER_HEIGHT_MM;
      under = blendLinear(bandUnder, over, transmissionAtThickness(thickness, materials[materialIndex].tdMm));
      result.push(toPaletteColor(stopLevel, materialIndex, `${materials[materialIndex].name} ${layer}/4`, rgbToHex(under)));
    }
  }
  return result;
}

function toPaletteColor(stopLevel: number, materialIndex: number, name: string, hex: string): StackPaletteColor {
  return {
    id: makeStackColorId(stopLevel, hex),
    name,
    hex,
    rgb: hexToRgb(hex).map(Math.round) as [number, number, number],
    primaryBrand: 'MARD',
    primaryCode: `L${stopLevel}`,
    codes: { MARD: `L${stopLevel}` },
    group: 'Layered',
    stopLevel,
    materialIndex,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(normalizeHex(hex).slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

function blendLinear(under: [number, number, number], over: [number, number, number], transmission: number): [number, number, number] {
  return under.map((value, index) => {
    const linear = srgbToLinear(over[index]) * (1 - transmission) + srgbToLinear(value) * transmission;
    return linearToSrgb(linear);
  }) as [number, number, number];
}

function srgbToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const channel = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, channel * 255));
}
```

Update `src/palette.ts` so `getColor()` resolves `paletteColorFromStackId(id)` between the AMS parser and the static MARD palette.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
npm run build
node --test tests/stacking.test.mjs tests/colors.test.mjs
npm test
```

Expected: the focused tests pass; the full existing suite passes without changing solid output.

- [ ] **Step 5: Commit the pure stack palette**

```bash
git add src/types.ts src/print/colors.ts src/print/stacking.ts src/palette.ts src/print/settings.ts tests/colors.test.mjs tests/stacking.test.mjs
git commit -m "feat: add calibrated filament stack palette"
```

---

### Task 2: Project migration, reversible remapping, and physical usage

**Files:**

- Modify: `src/project.ts:1-170`
- Modify: `src/usage.ts:1-30`
- Modify: `src/types.ts:95-100`
- Modify: `tests/stacking.test.mjs`

**Interfaces:**

- Consumes: `buildStackPalette`, `parseStackColorId`, `STACK_TEMPLATES`, `nearestPaletteColorOklab`, and `getColor`.
- Produces: `withPrintMode(project, mode)`, `withLayeredMaterials(project, materials)`, `withStackTemplate(project, templateId)`, and `summarizeLayeredUsage(project)`.
- Produces: `FilamentLayerUsageRow = { color: PaletteColor; layerCells: number }`.

- [ ] **Step 1: Add failing migration and usage tests**

Append to `tests/stacking.test.mjs`:

```js
import { createProject, normalizeProject, withLayeredMaterials, withPrintMode, withStackTemplate } from "../generated/dist/src/project.js";
import { summarizeLayeredUsage } from "../generated/dist/src/usage.js";

test("old projects normalize to solid mode with safe TD", () => {
  const old = createProject(1, 1);
  delete old.printSettings.mode;
  old.amsColors.forEach((color) => delete color.tdMm);
  const normalized = normalizeProject(old);
  assert.equal(normalized.printSettings.mode, "solid");
  assert.ok(normalized.amsColors.every((color) => color.tdMm === 1));
});

test("mode changes remap cells and layered TD changes preserve stop levels", () => {
  const solid = createProject(2, 1);
  solid.layers[0].cells = [solid.amsColors[0].id, solid.amsColors[1].id];
  const layered = withPrintMode(solid, "layered");
  const palette = buildStackPalette(layered.amsColors);
  layered.layers[0].cells = [palette[1].id, palette[12].id];
  const levels = layered.layers[0].cells.map((id) => parseStackColorId(id).stopLevel);
  const materials = layered.amsColors.map((color, index) => ({ ...color, tdMm: index === 1 ? 1.7 : color.tdMm }));
  const recalibrated = withLayeredMaterials(layered, materials);
  assert.deepEqual(recalibrated.layers[0].cells.map((id) => parseStackColorId(id).stopLevel), levels);
  assert.ok(recalibrated.layers[0].cells.some((id, index) => id !== layered.layers[0].cells[index]));
  assert.ok(withPrintMode(recalibrated, "solid").layers[0].cells.every((id) => id?.startsWith("ams-")));
});

test("layered usage reports physical filament layer-cells", () => {
  const project = withStackTemplate(createProject(3, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[12].id];
  assert.deepEqual(summarizeLayeredUsage(project).map((row) => row.layerCells), [12, 8, 4, 4]);
});
```

- [ ] **Step 2: Verify the tests fail for missing project APIs**

Run:

```bash
npm run build
node --test tests/stacking.test.mjs
```

Expected: build or import fails for `withPrintMode`, `withLayeredMaterials`, `withStackTemplate`, and `summarizeLayeredUsage`.

- [ ] **Step 3: Normalize and remap projects with one shared path**

In `src/project.ts`, import the stack helpers and add these public functions:

```ts
export function withPrintMode(project: BeadProject, mode: PrintMode): BeadProject {
  const palette = mode === 'layered'
    ? buildStackPalette(project.amsColors)
    : project.amsColors.map(amsColorToPaletteColor);
  return remapPrintCells(project, project.amsColors, mode, palette);
}

export function withLayeredMaterials(project: BeadProject, materials: AmsColor[]): BeadProject {
  const nextMaterials = materials.map((material) => ({ ...material }));
  return remapPrintCells(project, nextMaterials, 'layered', buildStackPalette(nextMaterials));
}

export function withStackTemplate(project: BeadProject, id: StackTemplateId): BeadProject {
  return withLayeredMaterials(project, STACK_TEMPLATES[id].map((material) => ({ ...material })));
}

function remapPrintCells(
  project: BeadProject,
  materials: AmsColor[],
  mode: PrintMode,
  palette: PaletteColor[],
): BeadProject {
  const byLevel = new Map(palette.flatMap((color) => {
    const parsed = parseStackColorId(color.id);
    return parsed ? [[parsed.stopLevel, color.id] as const] : [];
  }));
  const remap = (id: string | null): string | null => {
    if (!id) return null;
    const parsed = parseStackColorId(id);
    if (mode === 'layered' && parsed && byLevel.has(parsed.stopLevel)) return byLevel.get(parsed.stopLevel) ?? null;
    const source = getColor(id);
    return source ? nearestPaletteColorOklab(source.hex, palette).id : palette[0].id;
  };
  const layers = project.layers.map((layer) => ({ ...layer, cells: layer.cells.map(remap) }));
  return {
    ...project,
    amsColors: materials,
    printSettings: {
      ...project.printSettings,
      mode,
      baseColorId: materials[0].id,
    },
    layers,
    cells: composeVisibleCells(layers, project.width, project.height),
    updatedAt: new Date().toISOString(),
  };
}
```

In `normalizeAmsColors`, preserve a TD only when it is finite and `0 < tdMm <= 100`; otherwise use the matching default's `1`. In `normalizeProject`, keep `'layered'` only when that exact value is present and at least two AMS colors survived normalization; otherwise use `'solid'`. Make `withPrintMode(project, 'layered')` throw `Layered mode needs two to four filaments.` when fewer than two colors are configured.

Add the usage type to `src/types.ts`:

```ts
export type FilamentLayerUsageRow = {
  color: PaletteColor;
  layerCells: number;
};
```

Add the physical estimate to `src/usage.ts`:

```ts
export function summarizeLayeredUsage(project: BeadProject): FilamentLayerUsageRow[] {
  const totals = project.amsColors.map(() => 0);
  for (const layer of (project.layers ?? []).filter((item) => item.includeInUsage)) {
    for (const id of layer.cells) {
      if (!id) continue;
      const stopLevel = parseStackColorId(id)?.stopLevel ?? STACK_LAYERS_PER_FILAMENT;
      totals.forEach((_, materialIndex) => {
        const bandStart = materialIndex * STACK_LAYERS_PER_FILAMENT;
        totals[materialIndex] += Math.max(0, Math.min(STACK_LAYERS_PER_FILAMENT, stopLevel - bandStart));
      });
    }
  }
  return project.amsColors.map((material, index) => ({
    color: amsColorToPaletteColor(material),
    layerCells: totals[index],
  }));
}
```

- [ ] **Step 4: Run migration, usage, and complete regression tests**

Run:

```bash
npm run build
node --test tests/stacking.test.mjs tests/colors.test.mjs
npm test
```

Expected: all tests pass, including unchanged solid-project tests.

- [ ] **Step 5: Commit persistence and usage**

```bash
git add src/project.ts src/usage.ts src/types.ts tests/stacking.test.mjs
git commit -m "feat: persist and remap layered print projects"
```

---

### Task 3: Closed layered bead geometry and material-band model

**Files:**

- Modify: `src/print/geometry.ts:1-95`
- Modify: `src/print/model.ts:1-116`
- Modify: `src/print/validation.ts:1-90`
- Modify: `tests/model.test.mjs`
- Modify: `tests/geometry.test.mjs`

**Interfaces:**

- Consumes: stack levels `4..materials.length * 4`, fixed `0.08 mm` layers, existing cell pitch/base settings, and the generated stack palette.
- Produces: `appendFusedBeadSection(...)`, `appendFusedBeadTop(...)`, and a `PrintableGrid` discriminated by `mode`.
- Produces: `PrintableModel.mode`, `previewParts`, `inputErrors`, and optional `layered: { layerHeightMm; perceivedColorCount; swapCount }`.
- Preserves: existing `buildPrintableModel(composePrintableGrid(project))` API for all callers.

- [ ] **Step 1: Add failing layered model and topology tests**

Append to `tests/model.test.mjs`:

```js
import { withStackTemplate } from "../generated/dist/src/project.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";

test("layered cells become four disjoint material bands", () => {
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  assert.equal(model.mode, "layered");
  assert.deepEqual(model.parts.map((part) => part.name), [
    "Base_and_Beads_Bambu_PLA_Basic_Blue",
    "Stack_Bambu_PLA_Basic_Red",
    "Stack_Bambu_PLA_Basic_Yellow",
    "Stack_Bambu_PLA_Basic_White",
  ]);
  assert.deepEqual(model.parts.map(meshBounds), [
    { min: [0, 0, 0], max: [20, 5, 1.52] },
    { min: [5, 0, 1.52], max: [20, 5, 1.84] },
    { min: [10, 0, 1.84], max: [20, 5, 2.16] },
    { min: [15, 0, 2.16], max: [20, 5, 2.48] },
  ]);
  assert.deepEqual(model.sizeMm, { x: 20, y: 5, z: 2.48 });
  assert.deepEqual(model.layered, { layerHeightMm: 0.08, perceivedColorCount: 4, swapCount: 3 });
});
```

Append to `tests/geometry.test.mjs`:

```js
test("every layered material band is closed and only touches its neighbors", async () => {
  const { withStackTemplate } = await import("../generated/dist/src/project.js");
  const { buildStackPalette } = await import("../generated/dist/src/print/stacking.js");
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  model.parts.forEach((part) => assert.deepEqual(closedEdgeErrors(part), []));
  assert.deepEqual(validatePrintableModel(model), []);
  for (let index = 1; index < model.parts.length; index += 1) {
    assert.equal(meshBounds(model.parts[index - 1]).max[2], meshBounds(model.parts[index]).min[2]);
  }
  project.printSettings.baseThicknessMm = 1.21;
  assert.match(validatePrintableModel(buildPrintableModel(composePrintableGrid(project))).join("\n"), /multiple of 0.08 mm/);
});
```

- [ ] **Step 2: Run focused tests and observe solid-only behavior fail**

Run:

```bash
npm run build
node --test tests/model.test.mjs tests/geometry.test.mjs
```

Expected: layered expectations fail because the model still remaps every stack ID to one solid AMS bead.

- [ ] **Step 3: Add closed Z-section geometry**

Add these exports to `src/print/geometry.ts`, reusing the file's existing `addVertex` and `addQuad` helpers:

```ts
export function appendMesh(target: MutableMesh, source: MeshData): void {
  const offset = target.vertices.length / 3;
  target.vertices.push(...source.vertices);
  target.triangles.push(...[...source.triangles].map((index) => index + offset));
}

export function appendFusedBeadSection(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  settings: PrintSettings,
  bottomZ: number,
  topZ: number,
  firstBand: boolean,
  exposedTop: boolean,
  segments = 24,
): void {
  const topRadius = settings.cellPitchMm / 2;
  const lowerRadius = topRadius - 0.15;
  const bevelRadius = topRadius - 0.05;
  const dimpleRadius = settings.dimpleDiameterMm / 2;
  const rings: Array<[number, number]> = firstBand
    ? [[lowerRadius, bottomZ], [topRadius, Math.min(topZ, bottomZ + STACK_LAYER_HEIGHT_MM)]]
    : [[topRadius, bottomZ]];
  const pushDistinct = (radius: number, z: number) => {
    const last = rings[rings.length - 1];
    if (!last || Math.abs(last[0] - radius) > 1e-9 || Math.abs(last[1] - z) > 1e-9) rings.push([radius, z]);
  };
  if (exposedTop) {
    pushDistinct(topRadius, Math.max(bottomZ, topZ - STACK_LAYER_HEIGHT_MM));
    pushDistinct(bevelRadius, topZ);
    if (dimpleRadius > 0) {
      pushDistinct(dimpleRadius, topZ);
      pushDistinct(dimpleRadius, topZ - STACK_LAYER_HEIGHT_MM);
    }
  } else {
    pushDistinct(topRadius, topZ);
  }
  appendClosedRings(target, centerX, centerY, rings, segments);
}

export function appendFusedBeadTop(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  settings: PrintSettings,
  topZ: number,
  segments = 24,
): void {
  const rings: Array<[number, number]> = [
    [settings.cellPitchMm / 2, topZ - STACK_LAYER_HEIGHT_MM],
    [settings.cellPitchMm / 2 - 0.05, topZ],
  ];
  const dimpleRadius = settings.dimpleDiameterMm / 2;
  if (dimpleRadius > 0) rings.push(
    [dimpleRadius, topZ],
    [dimpleRadius, topZ - STACK_LAYER_HEIGHT_MM],
  );
  appendOpenTopRings(target, centerX, centerY, rings, segments, 0.002);
}

function appendClosedRings(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  specs: Array<[number, number]>,
  segments: number,
): void {
  const rings = createRings(target, centerX, centerY, specs, segments, 0);
  connectRings(target, rings);
  const bottomCenter = addVertex(target, centerX, centerY, specs[0][1]);
  const topCenter = addVertex(target, centerX, centerY, specs[specs.length - 1][1]);
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    target.triangles.push(bottomCenter, rings[0][next], rings[0][index]);
    target.triangles.push(topCenter, rings[rings.length - 1][index], rings[rings.length - 1][next]);
  }
}

function appendOpenTopRings(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  specs: Array<[number, number]>,
  segments: number,
  zOffset: number,
): void {
  const rings = createRings(target, centerX, centerY, specs, segments, zOffset);
  connectRings(target, rings);
  const topCenter = addVertex(target, centerX, centerY, specs[specs.length - 1][1] + zOffset);
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    target.triangles.push(topCenter, rings[rings.length - 1][index], rings[rings.length - 1][next]);
  }
}

function createRings(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  specs: Array<[number, number]>,
  segments: number,
  zOffset: number,
): number[][] {
  return specs.map(([radius, z]) => Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return addVertex(target, centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, z + zOffset);
  }));
}

function connectRings(target: MutableMesh, rings: number[][]): void {
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let index = 0; index < rings[ring].length; index += 1) {
      const next = (index + 1) % rings[ring].length;
      addQuad(target, rings[ring][index], rings[ring][next], rings[ring + 1][next], rings[ring + 1][index]);
    }
  }
}
```

Route the existing `appendFusedBead` ring specification through `appendClosedRings`. Its public signature and current solid-mode output remain unchanged. `appendOpenTopRings` intentionally has no bottom face because it is preview-only.

- [ ] **Step 4: Branch the printable grid and build layered bands**

Replace the single grid type in `src/print/model.ts` with:

```ts
export type SolidPrintableGrid = {
  mode: 'solid';
  width: number;
  height: number;
  cells: string[];
  materials: AmsColor[];
  settings: PrintSettings;
};

export type LayeredPrintableGrid = {
  mode: 'layered';
  width: number;
  height: number;
  stopLevels: number[];
  stackPalette: StackPaletteColor[];
  materials: AmsColor[];
  settings: PrintSettings;
  inputErrors: string[];
};

export type PrintableGrid = SolidPrintableGrid | LayeredPrintableGrid;

export type PreviewPart = {
  name: string;
  color: string;
  vertices: Float32Array;
  triangles: Uint32Array;
};

export type PrintableModel = {
  name: string;
  mode: PrintMode;
  materials: AmsColor[];
  parts: PrintablePart[];
  previewParts: PreviewPart[];
  inputErrors: string[];
  gridSize: { width: number; height: number };
  settings: PrintSettings;
  sizeMm: { x: number; y: number; z: number };
  layered?: {
    layerHeightMm: number;
    perceivedColorCount: number;
    swapCount: number;
  };
};
```

Keep the existing solid grid branch unchanged and put this layered branch at the start of `composePrintableGrid`:

```ts
if (project.printSettings.mode === 'layered') {
  const stackPalette = buildStackPalette(project.amsColors);
  const inputErrors: string[] = [];
  const minimum = STACK_LAYERS_PER_FILAMENT;
  const maximum = project.amsColors.length * STACK_LAYERS_PER_FILAMENT;
  const stopLevels = composeVisibleCells(project.layers, project.width, project.height).map((id, index) => {
    if (!id) return minimum;
    const parsed = parseStackColorId(id);
    if (parsed && parsed.stopLevel >= minimum && parsed.stopLevel <= maximum) return parsed.stopLevel;
    if (id.startsWith('stack-')) {
      inputErrors.push(`Cell ${index + 1} has an invalid layered stop color.`);
      return minimum;
    }
    const source = getColor(id);
    if (!source) {
      inputErrors.push(`Cell ${index + 1} references an unknown color.`);
      return minimum;
    }
    const nearest = nearestPaletteColorOklab(source.hex, stackPalette);
    return parseStackColorId(nearest.id)?.stopLevel ?? minimum;
  });
  return {
    mode: 'layered',
    width: project.width,
    height: project.height,
    stopLevels,
    stackPalette,
    materials: project.amsColors.map((color) => ({ ...color })),
    settings: { ...project.printSettings, baseColorId: project.amsColors[0].id },
    inputErrors,
  };
}
```

Use this band loop in a private `buildLayeredPrintableModel(grid)`:

```ts
const parts: PrintablePart[] = [];
const previewParts: PreviewPart[] = [];
const widthMm = grid.width * grid.settings.cellPitchMm;
const heightMm = grid.height * grid.settings.cellPitchMm;
const maxStopLevel = Math.max(...grid.stopLevels);
for (let materialIndex = 0; materialIndex < grid.materials.length; materialIndex += 1) {
  const bandStart = materialIndex * STACK_LAYERS_PER_FILAMENT;
  const bandEnd = (materialIndex + 1) * STACK_LAYERS_PER_FILAMENT;
  const mesh: MutableMesh = { vertices: [], triangles: [] };
  if (materialIndex === 0) appendMesh(mesh, createBaseMesh(widthMm, heightMm, grid.settings.baseThicknessMm));
  grid.stopLevels.forEach((stopLevel, cellIndex) => {
    if (stopLevel <= bandStart) return;
    const x = (cellIndex % grid.width + 0.5) * grid.settings.cellPitchMm;
    const row = Math.floor(cellIndex / grid.width);
    const y = (grid.height - row - 0.5) * grid.settings.cellPitchMm;
    appendFusedBeadSection(
      mesh,
      x,
      y,
      grid.settings,
      grid.settings.baseThicknessMm + bandStart * STACK_LAYER_HEIGHT_MM,
      grid.settings.baseThicknessMm + Math.min(stopLevel, bandEnd) * STACK_LAYER_HEIGHT_MM,
      materialIndex === 0,
      stopLevel <= bandEnd,
    );
  });
  if (mesh.triangles.length) parts.push({
    name: `${materialIndex === 0 ? 'Base_and_Beads' : 'Stack'}_${safeName(grid.materials[materialIndex].name)}`,
    materialId: grid.materials[materialIndex].id,
    vertices: new Float32Array(mesh.vertices),
    triangles: new Uint32Array(mesh.triangles),
  });
}
for (const candidate of grid.stackPalette) {
  const mesh: MutableMesh = { vertices: [], triangles: [] };
  grid.stopLevels.forEach((stopLevel, cellIndex) => {
    if (stopLevel !== candidate.stopLevel) return;
    const x = (cellIndex % grid.width + 0.5) * grid.settings.cellPitchMm;
    const row = Math.floor(cellIndex / grid.width);
    const y = (grid.height - row - 0.5) * grid.settings.cellPitchMm;
    appendFusedBeadTop(mesh, x, y, grid.settings, grid.settings.baseThicknessMm + stopLevel * STACK_LAYER_HEIGHT_MM);
  });
  if (mesh.triangles.length) previewParts.push({
    name: `Estimated_${candidate.primaryCode}`,
    color: candidate.hex,
    vertices: new Float32Array(mesh.vertices),
    triangles: new Uint32Array(mesh.triangles),
  });
}

function safeName(value: string): string {
  return value.trim().replace(/\s+/g, '_') || 'Filament';
}
```

Return the layered model from the private builder with effective print settings and make the public builder branch before its existing solid implementation:

```ts
const effectiveSettings: PrintSettings = {
  ...grid.settings,
  beadHeightMm: maxStopLevel * STACK_LAYER_HEIGHT_MM,
  dimpleDepthMm: STACK_LAYER_HEIGHT_MM,
  baseColorId: grid.materials[0].id,
};
return {
  name: 'Pingdou',
  mode: 'layered',
  materials: grid.materials.map((material) => ({ ...material })),
  parts,
  previewParts,
  inputErrors: [...grid.inputErrors],
  gridSize: { width: grid.width, height: grid.height },
  settings: effectiveSettings,
  sizeMm: {
    x: widthMm,
    y: heightMm,
    z: grid.settings.baseThicknessMm + maxStopLevel * STACK_LAYER_HEIGHT_MM,
  },
  layered: {
    layerHeightMm: STACK_LAYER_HEIGHT_MM,
    perceivedColorCount: new Set(grid.stopLevels).size,
    swapCount: Math.max(0, parts.length - 1),
  },
};

export function buildPrintableModel(grid: PrintableGrid): PrintableModel {
  if (grid.mode === 'layered') return buildLayeredPrintableModel(grid);
  return buildSolidPrintableModel(grid);
}
```

Move the body of the current `buildPrintableModel` into `buildSolidPrintableModel`. Add `mode: 'solid'`, `previewParts: []`, `inputErrors: []`, and `layered: undefined` to its existing return without changing any solid dimensions, parts, or material filtering.

In `validatePrintableModel`, start with `const errors = [...model.inputErrors]`, change the part-count check, and add the layered branch below before normal per-part topology checks:

```ts
if (model.parts.length < (model.mode === 'layered' ? 1 : 2)) {
  errors.push(model.mode === 'layered'
    ? 'The layered model needs a combined base/bead part.'
    : 'The model needs a base and at least one bead part.');
}
if (model.mode === 'layered') {
  if (model.materials.length < 2 || model.materials.length > 4) {
    errors.push('Layered mode needs two to four filaments.');
  }
  if (model.materials.some((material) => !Number.isFinite(material.tdMm) || material.tdMm <= 0 || material.tdMm > 100)) {
    errors.push('Every layered filament TD must be between 0.01 and 100 mm.');
  }
  const baseLayers = model.settings.baseThicknessMm / STACK_LAYER_HEIGHT_MM;
  if (Math.abs(baseLayers - Math.round(baseLayers)) >= 1e-6) {
    errors.push('Layered base thickness must be a multiple of 0.08 mm.');
  }
  const spans = model.parts.map((part) => {
    const z = Array.from({ length: part.vertices.length / 3 }, (_, index) => part.vertices[index * 3 + 2]);
    return { name: part.name, min: Math.min(...z), max: Math.max(...z) };
  });
  for (let left = 0; left < spans.length; left += 1) {
    for (let right = left + 1; right < spans.length; right += 1) {
      if (Math.min(spans[left].max, spans[right].max) - Math.max(spans[left].min, spans[right].min) > 1e-6) {
        errors.push(`${spans[left].name} and ${spans[right].name} overlap in Z.`);
      }
    }
  }
}
```

Import `STACK_LAYER_HEIGHT_MM` in validation. Keep the existing material-reference, index, degenerate-triangle, and closed-edge checks after this branch.

- [ ] **Step 5: Run topology and regression checks, then commit**

Run:

```bash
npm run build
node --test tests/model.test.mjs tests/geometry.test.mjs
npm test
```

Expected: all layered parts are closed, band bounds touch without overlap, and every existing solid test remains green.

```bash
git add src/print/geometry.ts src/print/model.ts src/print/validation.ts tests/model.test.mjs tests/geometry.test.mjs
git commit -m "feat: build closed layered bead material bands"
```

---

### Task 4: Predicted 3D tops and standard 3MF round trip

**Files:**

- Modify: `src/ThreePreview.tsx:210-250`
- Modify: `tests/preview.test.mjs`
- Modify: `tests/three-mf.test.mjs`

**Interfaces:**

- Consumes: `PrintableModel.parts` as exported physical geometry and `PrintableModel.previewParts` as display-only estimated tops.
- Preserves: `createThreeMf(model)` reads only `model.parts`; preview geometry can never enter the archive.
- Produces: Three.js meshes named after each preview part with `userData.previewOverlay === true`.

- [ ] **Step 1: Add failing preview and archive-isolation tests**

Append to `tests/preview.test.mjs`:

```js
test("layered preview adds estimated top colors without replacing print bands", async () => {
  const { withStackTemplate } = await import("../generated/dist/src/project.js");
  const { buildStackPalette } = await import("../generated/dist/src/print/stacking.js");
  const project = withStackTemplate(createProject(2, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  const group = createPreviewGroup(model);
  assert.equal(group.children.length, model.parts.length + model.previewParts.length);
  assert.equal(group.children.filter((mesh) => mesh.userData.previewOverlay).length, 2);
  assert.deepEqual(
    group.children.filter((mesh) => mesh.userData.previewOverlay).map((mesh) => `#${mesh.material.color.getHexString()}`),
    model.previewParts.map((part) => part.color),
  );
});
```

Append to `tests/three-mf.test.mjs`:

```js
test("layered 3MF exports only physical material bands", async () => {
  const { withStackTemplate } = await import("../generated/dist/src/project.js");
  const { buildStackPalette } = await import("../generated/dist/src/print/stacking.js");
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  const xml = new TextDecoder().decode(readStoredEntries(createThreeMf(model)).get("3D/3dmodel.model"));
  assert.equal((xml.match(/<base /g) ?? []).length, 4);
  assert.equal((xml.match(/<component objectid=/g) ?? []).length, 4);
  assert.doesNotMatch(xml, /Estimated_/);
  assert.match(xml, /Base_and_Beads_Bambu_PLA_Basic_Blue/);
  assert.match(xml, /Stack_Bambu_PLA_Basic_White/);
});
```

- [ ] **Step 2: Run tests and verify preview overlays are missing**

Run:

```bash
npm run build
node --test tests/preview.test.mjs tests/three-mf.test.mjs
```

Expected: layered preview child-count and overlay-marker assertions fail; the physical 3MF assertions already pass if Task 3 is correct.

- [ ] **Step 3: Render overlays after physical meshes**

Keep the existing physical-part loop in `createPreviewGroup(model)`, then append:

```ts
for (const part of model.previewParts ?? []) {
  const mesh = new THREE.Mesh(
    toBufferGeometry(part),
    new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.72, metalness: 0 }),
  );
  mesh.name = part.name;
  mesh.userData.previewOverlay = true;
  mesh.renderOrder = 1;
  group.add(mesh);
}
```

Generalize `toBufferGeometry` to accept `{ vertices: Float32Array; triangles: Uint32Array }`, so physical and preview parts share exactly one conversion path.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
npm run build
node --test tests/preview.test.mjs tests/three-mf.test.mjs
npm test
```

Expected: predicted overlays appear only in Three.js; the 3MF still contains four physical components and four materials.

- [ ] **Step 5: Commit preview and round-trip coverage**

```bash
git add src/ThreePreview.tsx tests/preview.test.mjs tests/three-mf.test.mjs
git commit -m "feat: preview estimated layered bead colors"
```

---

### Task 5: Layered controls, image generation, and physical-usage UI

**Files:**

- Modify: `src/imageToBeads.ts:37-68`
- Modify: `src/App.tsx:10-30,35-400,589-617,749-757,1003-1056,1271-1310,1560-1620,2461-2585`
- Modify: `src/PrintSettingsPanel.tsx:1-154`
- Modify: `src/styles.css`
- Modify: `tests/colors.test.mjs`

**Interfaces:**

- Consumes: `buildStackPalette`, `withPrintMode`, `withLayeredMaterials`, `withStackTemplate`, and `summarizeLayeredUsage`.
- Produces: one existing `activePalette` variable that is physical AMS colors in solid mode and predicted stop colors in layered mode.
- Preserves: all existing editor tools because both palette modes still store string cell IDs.

- [ ] **Step 1: Extend the image-planning test to thirteen colors**

Add to the image-conversion test in `tests/colors.test.mjs`:

```js
assert.deepEqual(planImageConversion("image/png", 1200, 800, 32, 13, 13), {
  width: 32,
  height: 21,
  sourceWidth: 1200,
  sourceHeight: 800,
  maxColors: 13,
});
assert.throws(() => planImageConversion("image/png", 10, 10, 8, 17, 17), /sixteen/);
```

- [ ] **Step 2: Verify the existing four-color guard fails the new test**

Run:

```bash
npm run build
node --test tests/colors.test.mjs
```

Expected: the thirteen-color call throws `Choose between one and four AMS colors.`

- [ ] **Step 3: Permit generated palettes and select the right palette in App**

Change the pure guard in `planImageConversion` to:

```ts
if (paletteLength < 1 || paletteLength > 16) throw new Error('Choose between one and sixteen printable colors.');
```

Update the existing zero-palette assertion in `tests/colors.test.mjs` from `/one and four/` to `/one and sixteen/`; the solid UI still supplies no more than four physical colors.

In `App`, derive both palettes and keep every existing caller on `activePalette`:

```ts
const solidPalette = useMemo(() => project.amsColors.map(amsColorToPaletteColor), [project.amsColors]);
const stackPalette = useMemo(() => (
  project.printSettings.mode === 'layered' ? buildStackPalette(project.amsColors) : []
), [project.amsColors, project.printSettings.mode]);
const activePalette = project.printSettings.mode === 'layered' ? stackPalette : solidPalette;
const layeredUsage = useMemo(() => (
  project.printSettings.mode === 'layered' ? summarizeLayeredUsage(project) : []
), [project]);
```

Pass `maxColors: activePalette.length` to `imageFileToBeads`. Add `project.printSettings.mode` to the automatic-regeneration effect dependencies so switching modes with a loaded source regenerates once. Without a source, mode helpers already remap existing cells.

Add these bilingual strings to both `ui.zh` and `ui.en`:

```ts
printMode: '打印颜色模式',
solidMode: '普通四色',
layeredMode: 'AMS 叠色',
layeredEstimate: '预计成色 · 0.08 mm/层 · 每种耗材 4 层',
stackOrder: '从底到顶',
tdLabel: 'TD (mm)',
tdBaseHint: '底色按不透光处理',
stackTemplate: '示例配色',
templateWarning: '示例 TD 仅供预览；打印前请用你的耗材校准。',
layerCells: '层格',
globalSwaps: '全局换料',
```

Add the matching `ui.en` values:

```ts
printMode: 'Print color mode',
solidMode: 'Solid colors',
layeredMode: 'AMS layered',
layeredEstimate: 'Estimated color · 0.08 mm/layer · 4 layers per filament',
stackOrder: 'Bottom to top',
tdLabel: 'TD (mm)',
tdBaseHint: 'Base treated as opaque',
stackTemplate: 'Starter palette',
templateWarning: 'Template TD values are estimates; calibrate your filament before printing.',
layerCells: 'layer-cells',
globalSwaps: 'global swaps',
```

- [ ] **Step 4: Add minimal print controls and preserve stop levels on edits**

In `PrintSettingsPanel`, rename `onBeforeRemoveColor` to `onCommit`, import the project helpers, and use this single update path:

```ts
function setMode(mode: PrintMode) {
  if (mode === project.printSettings.mode) return;
  onCommit();
  onChange(withPrintMode(project, mode));
}

function applyTemplate(id: StackTemplateId) {
  onCommit();
  onChange(withStackTemplate(project, id));
}

function updateColor(index: number, change: { name?: string; hex?: string; tdMm?: number }) {
  const previous = project.amsColors[index];
  const color = { ...previous, ...change };
  color.id = makeAmsColorId(index + 1, color.hex);
  if (project.printSettings.mode === 'layered') {
    onChange(withLayeredMaterials(project, project.amsColors.map((item, itemIndex) => itemIndex === index ? color : item)));
    return;
  }
  const renamed = color.id === previous.id ? project : replaceProjectColor(project, previous.id, color.id);
  onChange({ ...renamed, amsColors: renamed.amsColors.map((item, itemIndex) => itemIndex === index ? color : item) });
}

function addColor() {
  const fallback = DEFAULT_AMS_COLORS[project.amsColors.length];
  if (!fallback) return;
  const materials = [...project.amsColors, { ...fallback }];
  onCommit();
  onChange(project.printSettings.mode === 'layered'
    ? withLayeredMaterials(project, materials)
    : { ...project, amsColors: materials });
}

function removeLastColor() {
  const minimum = project.printSettings.mode === 'layered' ? 2 : 1;
  if (project.amsColors.length <= minimum) return;
  const removed = project.amsColors[project.amsColors.length - 1];
  onCommit();
  if (project.printSettings.mode === 'layered') {
    onChange(withLayeredMaterials(project, project.amsColors.slice(0, -1)));
    return;
  }
  const remapped = replaceProjectColor(project, removed.id, project.amsColors[0].id);
  onChange({ ...remapped, amsColors: remapped.amsColors.slice(0, -1) });
}
```

Render native mode and template controls above the AMS list:

```tsx
<div className="print-mode-row" aria-label={zh ? '打印颜色模式' : 'Print color mode'}>
  <label>
    <input
      type="radio"
      name="print-mode"
      checked={project.printSettings.mode === 'solid'}
      onChange={() => setMode('solid')}
    />
    {zh ? '普通四色' : 'Solid colors'}
  </label>
  <label>
    <input
      type="radio"
      name="print-mode"
      disabled={project.amsColors.length < 2}
      checked={project.printSettings.mode === 'layered'}
      onChange={() => setMode('layered')}
    />
    {zh ? 'AMS 叠色' : 'AMS layered'}
  </label>
</div>
{project.printSettings.mode === 'layered' && (
  <>
    <div className="stack-template-row">
      <button type="button" onClick={() => applyTemplate('cmyw')}>CMYW</button>
      <button type="button" onClick={() => applyTemplate('rybw')}>RYBW</button>
    </div>
    <p className="stack-mode-note">
      {zh
        ? '从底到顶 · 预计成色 · 0.08 mm/层 · 每种耗材 4 层。示例 TD 仅供预览；打印前请校准。'
        : 'Bottom to top · estimated color · 0.08 mm/layer · 4 layers per filament. Template TD values are estimates; calibrate before printing.'}
    </p>
  </>
)}
```

Render one TD number input inside each AMS row:

```tsx
{project.printSettings.mode === 'layered' && (
  <label className="ams-td-field">
    <span>TD (mm)</span>
    <input
      type="number"
      min="0.01"
      max="100"
      step="0.01"
      disabled={index === 0}
      value={color.tdMm}
      onChange={(event) => updateColor(index, {
        tdMm: Math.min(100, Math.max(0.01, Number(event.target.value) || 0.01)),
      })}
    />
  </label>
)}
```

Use this filtered numeric-field list and dynamic base step:

```ts
const visibleNumberFields = project.printSettings.mode === 'layered'
  ? numberFields.filter((field) => field.key !== 'beadHeightMm' && field.key !== 'dimpleDepthMm')
  : numberFields;
```

Render `visibleNumberFields` instead of `numberFields`, and set the number input's `step` to `0.08` when `field.key === 'baseThicknessMm' && project.printSettings.mode === 'layered'`; otherwise use `field.step`. Disable removal at two materials in layered mode. Hide the base-color select in layered mode and show `AMS 1 · <name>` as static text because AMS 1 is always the base.

Below the existing physical-size line, show the layered print summary from the model:

```tsx
{model.layered && (
  <div className="stack-print-summary">
    <span>{model.layered.perceivedColorCount} {zh ? '种预计成色已使用' : 'estimated colors used'}</span>
    <span>0.08 mm/{zh ? '层' : 'layer'}</span>
    <span>{model.layered.swapCount} {zh ? '次全局换料' : 'global swaps'}</span>
  </div>
)}
```

Pass `onCommit={commitHistory}` from `App`.

- [ ] **Step 5: Show physical filament usage without corrupting bead totals**

Keep the existing `usage` calculation and top-level `totalBeads` for drawing/export reports. Replace the current overview with conditional values:

```tsx
<div className="usage-overview">
  <div><span>{text.totalBeadsLabel}</span><strong>{totalBeads}</strong></div>
  <div>
    <span>{project.printSettings.mode === 'layered' ? (language === 'zh' ? '耗材' : 'Filaments') : text.colorTypes}</span>
    <strong>{project.printSettings.mode === 'layered' ? project.amsColors.length : usage.length}</strong>
  </div>
  <div>
    <span>{project.printSettings.mode === 'layered' ? text.layerCells : text.estimatedPacks}</span>
    <strong>{project.printSettings.mode === 'layered'
      ? layeredUsage.reduce((sum, row) => sum + row.layerCells, 0)
      : totalPacks}</strong>
  </div>
</div>
{project.printSettings.mode === 'solid' && (
  <label className="usage-pack-setting">
    <span>{text.beadsPerPack}</span>
    <div className="usage-pack-control">
      <div className="usage-pack-stepper">
        <button type="button" onClick={() => stepBeadsPerPack(-1)}>-</button>
        <input
          type="number"
          min={1}
          max={10000}
          step={500}
          value={project.settings.beadsPerPack}
          onChange={(event) => setBeadsPerPack(Number(event.target.value))}
        />
        <button type="button" onClick={() => stepBeadsPerPack(1)}>+</button>
      </div>
      <small>{text.perPackUnit}</small>
    </div>
  </label>
)}
```

Keep the current layer-selection controls between the overview and rows. Replace only the current `usage-list` contents with:

```tsx
<div className="usage-list">
  {project.printSettings.mode === 'layered'
    ? layeredUsage.map((row) => (
      <div className="usage-row" key={row.color.id}>
        <span className="usage-chip" style={{ backgroundColor: row.color.hex }} />
        <span className="usage-color-info">
          <strong>{row.color.primaryCode}</strong>
          <small>{row.color.name}</small>
        </span>
        <span className="usage-count">
          <strong>{row.layerCells}</strong>
          <small>{text.layerCells}</small>
        </span>
      </div>
    ))
    : usage.map((row) => (
      <button
        key={row.color.id}
        onMouseEnter={() => setHighlightedColorId(row.color.id)}
        onMouseLeave={() => setHighlightedColorId(null)}
      >
        <span className="usage-chip" style={{ backgroundColor: row.color.hex }} />
        <span className="usage-color-info">
          <strong>{displayCode(row.color)}</strong>
          <small>{displayName(row.color)}</small>
        </span>
        <span className="usage-count">
          <strong>{row.count}</strong>
          <small>{row.packs} {text.packUnit}</small>
        </span>
      </button>
    ))}
  {usage.length === 0 && project.printSettings.mode === 'solid' && <div className="usage-empty">{text.noUsage}</div>}
</div>
```

Do not alter `summarizeUsage`; layered physical estimates and pattern bead reports remain separate.

Add only these CSS rules, matching existing card/input tokens:

```css
.print-mode-row, .stack-template-row { display: flex; gap: 8px; }
.print-mode-row label { flex: 1; display: flex; align-items: center; gap: 6px; }
.ams-td-field { display: grid; grid-template-columns: auto 72px; align-items: center; gap: 6px; }
.ams-td-field input { min-width: 0; }
.stack-mode-note { font-size: 12px; line-height: 1.45; color: var(--text-muted); }
.stack-print-summary { display: flex; flex-wrap: wrap; gap: 6px 10px; color: var(--text-muted); font-size: 12px; }
.usage-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
```

- [ ] **Step 6: Build, run all tests, and manually smoke-test the browser**

Run:

```bash
npm run build
node --test tests/colors.test.mjs tests/stacking.test.mjs
npm test
npm run dev
```

Expected automated result: all tests pass. At `http://127.0.0.1:5174/`, confirm solid mode is unchanged; layered mode shows thirteen `L4..L16` swatches with four filaments, changing TD preserves selected stop levels but changes predicted hex colors, and an uploaded image regenerates using more than four swatches.

- [ ] **Step 7: Commit the user-facing mode**

```bash
git add src/imageToBeads.ts src/App.tsx src/PrintSettingsPanel.tsx src/styles.css tests/colors.test.mjs
git commit -m "feat: expose AMS layered color workflow"
```

---

### Task 6: Fixed sample, documentation, and official P2S slice acceptance

**Files:**

- Create: `scripts/generate-layered-sample.mjs`
- Create: `samples/pingdou-p2s-layered-sample.3mf`
- Modify: `package.json:8-14`
- Modify: `README.md`
- Modify: `docs/verification/bambu-studio-p2s.md`

**Interfaces:**

- Consumes: completed public project, stacking, model, validation, and 3MF APIs.
- Produces: a deterministic four-band layered 3MF fixture regenerated by `npm run verify`.
- Proves: standard 3MF import, assignable physical parts, P2S bounds, no repair warning, `0.08 mm` slicing, and at most three global material changes.

- [ ] **Step 1: Add the deterministic layered sample generator**

Create `scripts/generate-layered-sample.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createProject, withStackTemplate } from "../generated/dist/src/project.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";
import { validatePrintableModel } from "../generated/dist/src/print/validation.js";

const project = withStackTemplate(createProject(4, 4, "pingdou-p2s-layered-sample"), "rybw");
const palette = buildStackPalette(project.amsColors);
const levels = [0, 2, 4, 6, 8, 10, 12, 10, 8, 6, 4, 2, 0, 4, 8, 12];
project.layers[0].cells = levels.map((index) => palette[index].id);
const model = buildPrintableModel(composePrintableGrid(project));
const errors = validatePrintableModel(model);
if (errors.length) throw new Error(errors.join("\n"));
if (model.parts.length !== 4 || model.materials.length !== 4 || model.layered?.swapCount !== 3) {
  throw new Error(`Unexpected layered model: ${model.parts.length} parts, ${model.materials.length} materials, ${model.layered?.swapCount} swaps`);
}
if (JSON.stringify(model.sizeMm) !== JSON.stringify({ x: 20, y: 20, z: 2.48 })) {
  throw new Error(`Unexpected layered sample size: ${JSON.stringify(model.sizeMm)}`);
}
await mkdir("samples", { recursive: true });
await writeFile("samples/pingdou-p2s-layered-sample.3mf", createThreeMf(model));
console.log("samples/pingdou-p2s-layered-sample.3mf: 4 bands, 4 materials, 13 estimated colors, 20×20×2.48 mm");
```

Update package scripts so `sample` and `verify` run both sample generators:

```json
"sample": "npm run build && node scripts/generate-sample.mjs && node scripts/generate-layered-sample.mjs",
"verify": "npm run build && node --test tests/*.test.mjs && node scripts/generate-sample.mjs && node scripts/generate-layered-sample.mjs"
```

- [ ] **Step 2: Generate and structurally verify both samples**

Run:

```bash
npm run verify
unzip -t samples/pingdou-p2s-sample.3mf
unzip -t samples/pingdou-p2s-layered-sample.3mf
shasum -a 256 samples/pingdou-p2s-layered-sample.3mf
```

Expected: all Node tests pass; both archives report `No errors detected`; the new SHA-256 is recorded for the verification document.

- [ ] **Step 3: Document the exact layered workflow and limitations**

Add a `叠色模式` section to `README.md` containing:

```markdown
## AMS 叠色模式

叠色模式使用固定 0.08 mm 层高和从底到顶的一种全局耗材顺序。四卷耗材生成 13 个可编辑预计色，但最多只发生 3 次全局换料；它不是 Bambu Studio Mixed Filament，也不能覆盖任意 CMYK 色域。

1. 选择“AMS 叠色”，再选择 CMYW、RYBW 示例或填写自己的四卷 PLA。
2. 按从底到顶设置颜色；AMS 1 同时打印底板。填写每卷耗材的 TD，示例值只用于初始预览。
3. 重新导入原图以获得完整的 13 色量化；调好图案后导出 3MF。
4. 在 Bambu Studio 中选择 P2S 0.4 mm、首层 0.16 mm、其余层 0.08 mm 和 100% 填充，将四个命名分件映射到对应 AMS 槽。
5. 切片预览应只在材料带边界换料。颜色受实际耗材、温度和 TD 校准影响，请先打印小样。
```

Update the sample table and verification commands for both 3MF files. Keep the existing solid workflow untouched.

- [ ] **Step 4: Import and slice in official Bambu Studio**

Open the fixture:

```bash
open -a "/Volumes/Bambu Studio/BambuStudio.app" samples/pingdou-p2s-layered-sample.3mf
```

In Bambu Studio 02.07.01.62:

1. select `Bambu Lab P2S`, `0.4 mm nozzle`;
2. create/select a process with `0.16 mm` initial layer, `0.08 mm` remaining layers, and `100%` infill;
3. assign Blue, Red, Yellow, and White to the four imported child parts;
4. confirm dimensions `20 × 20 × 2.48 mm` and no model-repair warning;
5. slice and inspect `Filament` coloring layer-by-layer;
6. confirm Blue occupies the base/first band, followed only by Red, Yellow, then White, with no layer containing two colors;
7. record total layers, material-change count, time, filament estimate, imported labels, and screenshot observations in `docs/verification/bambu-studio-p2s.md`.

Expected: one assembly, four assignable parts, no repair warning, no out-of-bed/empty-layer error, and three or fewer global changes.

- [ ] **Step 5: Run clean verification and commit acceptance artifacts**

Run:

```bash
npm ci --ignore-scripts
npm run verify
git status --short
```

Expected: all tests and both deterministic generators pass; status lists only the intended Task 6 files before commit.

```bash
git add scripts/generate-layered-sample.mjs samples/pingdou-p2s-layered-sample.3mf package.json README.md docs/verification/bambu-studio-p2s.md
git commit -m "test: verify layered P2S print workflow"
```

---

## Completion audit

Before declaring the goal complete, inspect evidence rather than relying on the task commits:

- `git diff main...HEAD --stat` contains only the planned feature, tests, sample, and docs.
- `npm ci --ignore-scripts` and `npm run verify` pass from the implementation worktree.
- Solid fixture SHA and all pre-feature tests remain unchanged unless a deterministic format change is documented.
- `buildStackPalette(fourFilaments)` returns thirteen distinct, ordered stop candidates and tests prove TD behavior.
- Browser inspection proves image generation and editing use more than four predicted swatches.
- Every layered exported part passes the closed-edge and degenerate-triangle checks.
- Material Z spans touch only at boundaries and Bambu preview shows no same-layer mixing.
- The layered 3MF has at most four physical material IDs and excludes `Estimated_*` preview geometry.
- Bambu Studio evidence records successful P2S import and slice with at most three global changes.
- README states optical limitations, TD calibration, `0.16/0.08 mm`, `100%` infill, AMS mapping, and no Mixed Filament dependency.

If any item lacks direct evidence, keep the goal active and fix or verify it before calling it complete.
