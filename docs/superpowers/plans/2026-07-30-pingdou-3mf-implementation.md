# Pingdou Image-to-3MF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Track progress with the checkboxes below.

**Goal:** Build a local browser app that converts an uploaded image into a medium-ironed, circular Perler-bead-style relief and exports a grouped multi-part 3MF that Bambu Studio can color with up to four AMS slots for a Bambu Lab P2S.

**Architecture:** Pin and reuse the MIT-licensed `Jett-Wu/Perler_Beads_Generator` React/TypeScript/Three.js app. Keep image processing in the browser, add one small print-model layer shared by preview and export, and serialize a standards-based 3MF with a dependency-free store-only ZIP writer. The UI edits one rectangular fused panel; it does not attempt silhouette extraction or loose individual beads.

**Tech Stack:** React 18, TypeScript 5.4, Three.js 0.184, Canvas API, Node's built-in test runner, 3MF Core XML, browser `Blob` downloads.

## Global Constraints

- [ ] Preserve the upstream MIT license and record upstream commit `36ac52d570246ab600611a79edd2236bccb954e5`.
- [ ] Run fully locally in the browser; no upload service or server component.
- [ ] Accept JPG, PNG, and WebP, with a 4096-pixel processing-canvas ceiling.
- [ ] Use 1–4 user-editable AMS colors and OKLab nearest-color matching; no dithering.
- [ ] Default the image grid's long side to 32 cells and allow 8–50.
- [ ] Keep the printable panel within 250 × 250 mm for the P2S's 256 × 256 mm build area.
- [ ] Default to 5 mm pitch, 1.2 mm base, 0.8 mm bead relief, 1.2 mm dimple diameter, 0.2 mm dimple depth, and 24 radial segments.
- [ ] Export one rectangular, medium-ironed panel; silhouette mode and material presets are out of scope.
- [ ] Export one grouped 3MF containing `Base` plus one part per used AMS color and no more than four material IDs.
- [ ] Prefer platform and standard-library features. ZIP uses method 0 rather than adding a compression dependency.
- [ ] Use `node:test`; do not add a test framework.
- [ ] End every task with a runnable check and a focused commit.

## File Map

Import unchanged from upstream unless a task names the file: `src/WorkspaceCanvas.tsx`, `src/exporters.ts`, `src/usage.ts`, and the existing build scripts.

Modify:

- `package.json`, `package-lock.json`, `index.html`, `scripts/write-html.cjs`
- `src/types.ts`, `src/project.ts`, `src/palette.ts`, `src/imageToBeads.ts`
- `src/ThreePreview.tsx`, `src/App.tsx`, `src/styles.css`, `README.md`

Create:

- `UPSTREAM.md`
- `src/print/colors.ts`
- `src/print/settings.ts`
- `src/print/model.ts`
- `src/print/geometry.ts`
- `src/print/validation.ts`
- `src/print/zip.ts`
- `src/print/threeMf.ts`
- `src/PrintSettingsPanel.tsx`
- `tests/colors.test.mjs`
- `tests/model.test.mjs`
- `tests/geometry.test.mjs`
- `tests/three-mf.test.mjs`
- `scripts/generate-sample.mjs`
- `docs/verification/bambu-studio-p2s.md`
- `samples/pingdou-p2s-sample.3mf`

---

## Task 1: Import and Pin the MIT Baseline

**Files:**

- Create all upstream files at repository root.
- Create `UPSTREAM.md`.
- Modify `README.md`, `index.html`, and `scripts/write-html.cjs` only for the Pingdou name and local-use copy.

- [ ] **Step 1: Copy the pinned source without its `.git` directory**

Use the already inspected clone at `/tmp/pingdou-research.4AXj53/Perler_Beads_Generator`, and verify the exact commit before copying:

```bash
git -C /tmp/pingdou-research.4AXj53/Perler_Beads_Generator rev-parse HEAD
rsync -a --exclude .git /tmp/pingdou-research.4AXj53/Perler_Beads_Generator/ ./
```

Expected first command output:

```text
36ac52d570246ab600611a79edd2236bccb954e5
```

If that temporary clone no longer exists, request network approval, clone `https://github.com/Jett-Wu/Perler_Beads_Generator.git` into a new `mktemp -d` directory, and check out the same full SHA before running the copy. Never substitute the repository's current default branch.

- [ ] **Step 2: Record provenance**

Create `UPSTREAM.md`:

```markdown
# Upstream

This project began from [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator), used under its MIT License.

- Upstream commit: `36ac52d570246ab600611a79edd2236bccb954e5`
- Imported: 2026-07-30
- Local changes: Pingdou branding, custom AMS palette, fused printable geometry, grouped 3MF export, and P2S validation.

The upstream `LICENSE` file is retained unchanged.
```

- [ ] **Step 3: Apply the minimum rebrand**

Replace visible `Perler Beads Generator` titles with `Pingdou 3MF` and describe the app as a local image-to-print tool. Change the root package name to `pingdou-3mf` and its description accordingly, then let `npm install --package-lock-only --ignore-scripts` update only the lockfile's root metadata. Do not restructure the upstream app in this task.

- [ ] **Step 4: Verify the untouched baseline still builds**

Run:

```bash
npm ci
npm run build
git diff --check
```

Expected: dependency installation and build succeed; `git diff --check` is silent.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: import pinned perler generator baseline"
```

---

## Task 2: Persist a Four-Slot AMS Palette and Match in OKLab

**Files:**

- Create `src/print/colors.ts`.
- Create `src/print/settings.ts`.
- Create `tests/colors.test.mjs`.
- Modify `src/types.ts`.
- Modify `src/project.ts`.
- Modify `src/palette.ts`.
- Modify `src/imageToBeads.ts`.
- Modify `package.json` and regenerate `package-lock.json` only if the package script change affects it.

- [ ] **Step 1: Add the failing color contract**

Add a test script to `package.json`:

```json
"test": "npm run build && node --test tests/*.test.mjs"
```

Create `tests/colors.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createProject, normalizeProject } from "../generated/dist/src/project.js";
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

test("OKLab matching chooses the closest active AMS color", () => {
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
```

Run:

```bash
npm test
```

Expected: FAIL because `src/print/colors.ts` does not exist.

- [ ] **Step 2: Add project types and fixed defaults**

In `src/types.ts`, add:

```ts
export type AmsColor = {
  id: string;
  name: string;
  hex: string;
};

export type PrintSettings = {
  cellPitchMm: number;
  baseThicknessMm: number;
  beadHeightMm: number;
  dimpleDiameterMm: number;
  dimpleDepthMm: number;
  baseColorId: string;
};
```

Add `amsColors: AmsColor[]` and `printSettings: PrintSettings` to `BeadProject`.

Create `src/print/settings.ts`:

```ts
import type { PrintSettings } from "../types";

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  cellPitchMm: 5,
  baseThicknessMm: 1.2,
  beadHeightMm: 0.8,
  dimpleDiameterMm: 1.2,
  dimpleDepthMm: 0.2,
  baseColorId: "ams-1-1c1c1c",
};
```

- [ ] **Step 3: Implement encoded AMS colors and OKLab matching**

Create `src/print/colors.ts`:

```ts
import type { AmsColor, PaletteColor } from "../types";

export const DEFAULT_AMS_COLORS: AmsColor[] = [
  { id: "ams-1-1c1c1c", name: "Black", hex: "#1c1c1c" },
  { id: "ams-2-f4f1e8", name: "White", hex: "#f4f1e8" },
  { id: "ams-3-ed2b2b", name: "Red", hex: "#ed2b2b" },
  { id: "ams-4-2864dc", name: "Blue", hex: "#2864dc" },
];

export function makeAmsColorId(slot: number, hex: string): string {
  return `ams-${slot}-${hex.replace("#", "").toLowerCase()}`;
}

export function amsColorToPaletteColor(color: AmsColor): PaletteColor {
  const hex = color.hex.toLowerCase();
  const rgb = hex.match(/[0-9a-f]{2}/gi)?.map((part) => parseInt(part, 16));
  if (!rgb || rgb.length !== 3) throw new Error(`Invalid color: ${color.hex}`);
  return {
    id: color.id,
    name: color.name,
    hex,
    rgb: rgb as [number, number, number],
    primaryBrand: "MARD",
    primaryCode: color.name,
    codes: { MARD: color.name },
    group: "AMS",
  };
}

export function paletteColorFromAmsId(id: string): PaletteColor | null {
  const match = /^ams-([1-4])-([0-9a-f]{6})$/.exec(id);
  return match ? amsColorToPaletteColor({ id, name: `AMS ${match[1]}`, hex: `#${match[2]}` }) : null;
}

function srgbToLinear(value: number): number {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function rgbToOklab(rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function nearestPaletteColorOklab(hex: string, palette: PaletteColor[]): PaletteColor {
  if (!palette.length) throw new Error("At least one AMS color is required");
  const parsed = hex.match(/[0-9a-f]{2}/gi)?.map((part) => parseInt(part, 16));
  if (!parsed || parsed.length !== 3) throw new Error(`Invalid color: ${hex}`);
  const target = rgbToOklab(parsed as [number, number, number]);
  return palette.reduce((best, candidate) => {
    const lab = rgbToOklab(candidate.rgb);
    const distance = lab.reduce((sum, value, index) => sum + (value - target[index]) ** 2, 0);
    return distance < best.distance ? { color: candidate, distance } : best;
  }, { color: palette[0], distance: Infinity }).color;
}
```

- [ ] **Step 4: Migrate old projects in one place**

In `src/project.ts`, make `createProject` initialize object copies of `DEFAULT_AMS_COLORS` and `DEFAULT_PRINT_SETTINGS`. In the existing `normalizeProject` path, fill missing fields, clamp `amsColors` to 1–4 items, normalize each slot ID with `makeAmsColorId(index + 1, hex)`, fall back to that slot's default for malformed hex, and fall back `baseColorId` to slot 1 when it is absent from the normalized palette. Do not create a separate migration framework.

In `src/palette.ts`, make the existing shared lookup understand encoded IDs before consulting MARD:

```ts
export function getColor(id: string | null): PaletteColor | undefined {
  return id ? paletteColorFromAmsId(id) ?? palette.find((color) => color.id === id) : undefined;
}
```

Also change the existing shared `colorDistance(a, b)` implementation to Euclidean distance after `rgbToOklab(a)` and `rgbToOklab(b)`. Existing `nearestPaletteColor` and every image-ranking caller already route through this function, so this one root change moves the complete quantization path to OKLab without a parallel matcher. `nearestPaletteColorOklab` remains a small public hex-input contract used by the test.

This preserves all existing callers without threading palette state through them. The fuller `PaletteColor` shape above is required by the upstream canvas, usage, and exporter callers; do not reduce it to only `id/name/hex`.

- [ ] **Step 5: Bound image input and use OKLab**

In `src/imageToBeads.ts`:

- Reject files whose MIME type is not `image/jpeg`, `image/png`, or `image/webp` before decoding.
- Set `scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight))`, resize the processing canvas proportionally, and draw the image into those scaled source dimensions.
- Require `options.palette.length` between 1 and 4.
- Treat `options.width` as the requested long side: clamp it to 8–50, assign it to width for landscape images or height for portrait images, and calculate the other axis proportionally.
- Change the existing `Math.max(2, options.maxColors)` candidate floor to a 1–4 clamp so a single-slot palette remains single-color.
- Keep the existing area sampling, Canvas loading, alpha handling, and ranking flow. The shared `colorDistance` change supplies OKLab throughout that flow.

- [ ] **Step 6: Run the contract and commit**

```bash
npm test
git diff --check
git add package.json package-lock.json src/types.ts src/project.ts src/palette.ts src/imageToBeads.ts src/print tests/colors.test.mjs
git commit -m "feat: add four-slot AMS color matching"
```

Expected: both tests pass and the build remains green.

---

## Task 3: Build One Printable Model Shared by Preview and Export

**Files:**

- Create `src/print/model.ts`.
- Create `src/print/geometry.ts`.
- Create `src/print/validation.ts`.
- Create `tests/model.test.mjs`.
- Create `tests/geometry.test.mjs`.

- [ ] **Step 1: Add failing model-composition tests**

Create `tests/model.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";

test("visible cells become a base plus one part per used color", () => {
  const project = createProject(2, 2);
  project.layers[0].cells = [
    "ams-1-1c1c1c", "ams-2-f4f1e8",
    null, "ams-2-f4f1e8",
  ];
  const grid = composePrintableGrid(project);
  const model = buildPrintableModel(grid);
  assert.deepEqual(grid.cells, [
    "ams-1-1c1c1c", "ams-2-f4f1e8",
    "ams-1-1c1c1c", "ams-2-f4f1e8",
  ]);
  assert.deepEqual(model.parts.map((part) => part.name), ["Base", "Beads_Black", "Beads_White"]);
  assert.deepEqual(model.materials.map((material) => material.id), ["ams-1-1c1c1c", "ams-2-f4f1e8"]);
  assert.deepEqual(model.sizeMm, { x: 10, y: 10, z: 2 });
});
```

Create `tests/geometry.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel, meshBounds } from "../generated/dist/src/print/model.js";
import { closedEdgeErrors, validatePrintableModel } from "../generated/dist/src/print/validation.js";

test("the base and every fused bead shell are closed triangle meshes", () => {
  const project = createProject(2, 1);
  project.layers[0].cells = ["ams-1-1c1c1c", "ams-2-f4f1e8"];
  const model = buildPrintableModel(composePrintableGrid(project));
  assert.equal(model.parts.length, 3);
  for (const part of model.parts) assert.deepEqual(closedEdgeErrors(part), []);
  assert.deepEqual(model.sizeMm, { x: 10, y: 5, z: 2 });
  assert.deepEqual(meshBounds(model.parts[0]), { min: [0, 0, 0], max: [10, 5, 1.2] });
  assert.equal(meshBounds(model.parts[1]).min[2], 1.2);
  assert.equal(meshBounds(model.parts[1]).max[2], 2);
  assert.deepEqual(validatePrintableModel(model), []);
  assert.match(validatePrintableModel({ ...model, sizeMm: { ...model.sizeMm, x: 251 } }).join("\n"), /250/);
});
```

Run `npm test` and expect missing-module failures.

- [ ] **Step 2: Define the print-model boundary**

Create `src/print/model.ts` with these public values:

```ts
export type PrintablePart = {
  name: string;
  materialId: string;
  vertices: Float32Array;
  triangles: Uint32Array;
};

export type PrintableGrid = {
  width: number;
  height: number;
  cells: string[];
  materials: AmsColor[];
  settings: PrintSettings;
};

export type PrintableModel = {
  name: string;
  materials: AmsColor[];
  parts: PrintablePart[];
  gridSize: { width: number; height: number };
  settings: PrintSettings;
  sizeMm: { x: number; y: number; z: number };
};

export function composePrintableGrid(project: BeadProject): PrintableGrid;
export function buildPrintableModel(grid: PrintableGrid): PrintableModel;
export function meshBounds(part: PrintablePart): {
  min: [number, number, number];
  max: [number, number, number];
};
```

Implementation rules:

- Call the existing `composeVisibleCells(project.layers, project.width, project.height)`; the top visible cell wins. Do not duplicate layer composition.
- Convert null/eraser cells to `baseColorId`, so the output remains a rectangular panel.
- Keep an encoded AMS ID when active; map legacy/MARD IDs to the nearest active AMS color using OKLab.
- Produce `Base` first, then one `Beads_<name>` part for each used color in AMS slot order.
- Set `model.materials` to exactly the material IDs referenced by `Base` and the used bead parts, in AMS slot order; unused active slots are omitted from the 3MF.
- Set size to `width × pitch`, `height × pitch`, and `base + bead`.

- [ ] **Step 3: Generate the minimum closed fused-bead geometry**

Create `src/print/geometry.ts` with mutable array builders internally and typed-array output at the boundary:

```ts
export function createBaseMesh(widthMm: number, heightMm: number, thicknessMm: number): MeshData;
export function appendFusedBead(
  target: MutableMesh,
  centerX: number,
  centerY: number,
  settings: PrintSettings,
  segments?: number,
): void;
```

`createBaseMesh` is a closed cuboid. `appendFusedBead` defaults to 24 segments and uses these radial rings:

```ts
const topRadius = settings.cellPitchMm / 2;
const lowerRadius = topRadius - 0.15;
const bevelRadius = topRadius - 0.05;
const dimpleRadius = settings.dimpleDiameterMm / 2;
const baseZ = settings.baseThicknessMm;
const topZ = baseZ + settings.beadHeightMm;
const rings = [
  [lowerRadius, baseZ],
  [topRadius, Math.min(topZ, baseZ + 0.2)],
  [topRadius, Math.max(baseZ, topZ - 0.1)],
  [bevelRadius, topZ],
  [dimpleRadius, topZ],
  [dimpleRadius, topZ - settings.dimpleDepthMm],
];
```

Connect adjacent rings with consistently wound quads, triangulate the top annulus, close the dimple with a center fan, and close the underside with a center fan. Adjacent beads may touch at radius `pitch / 2`, but each shell remains independently watertight. Reverse row placement on Y so the printed image has the same orientation as the 2D canvas.

- [ ] **Step 4: Validate at the trust boundary**

Create `src/print/validation.ts`:

```ts
export function closedEdgeErrors(part: PrintablePart): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < part.triangles.length; i += 3) {
    const triangle = part.triangles.slice(i, i + 3);
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts].filter(([, count]) => count !== 2).map(([edge, count]) => `${edge}=${count}`);
}
```

Add `validatePrintableModel(model)` that reports, without mutating:

- zero-sized grids/models or empty parts;
- material count outside 1–4;
- X or Y above 250 mm;
- fewer than two parts;
- invalid or out-of-range triangle indices;
- any non-closed part;
- non-finite or non-positive pitch/base/bead and model dimensions;
- dimple depth outside `0..beadHeight` or dimple diameter outside `0..cellPitch`.

- [ ] **Step 5: Run and commit**

```bash
npm test
git diff --check
git add src/print/model.ts src/print/geometry.ts src/print/validation.ts tests/model.test.mjs tests/geometry.test.mjs
git commit -m "feat: build watertight fused bead geometry"
```

Expected: all tests pass; the 2 × 1 fixture creates three closed parts sized 10 × 5 × 2 mm.

---

## Task 4: Serialize a Deterministic Grouped 3MF

**Files:**

- Create `src/print/zip.ts`.
- Create `src/print/threeMf.ts`.
- Create `tests/three-mf.test.mjs`.

- [ ] **Step 1: Add the failing archive contract**

Create `tests/three-mf.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";

function readStoredEntries(archive) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(archive.slice(nameStart, nameStart + nameLength));
    entries.set(name, archive.slice(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  return entries;
}

test("3MF contains one assembly, named parts, and four or fewer base materials", () => {
  const project = createProject(2, 2);
  project.layers[0].cells = [
    "ams-1-1c1c1c", "ams-2-f4f1e8",
    "ams-3-ed2b2b", "ams-4-2864dc",
  ];
  const model = buildPrintableModel(composePrintableGrid(project));
  const archive = createThreeMf(model);
  assert.deepEqual(archive, createThreeMf(model));
  const entries = readStoredEntries(archive);
  assert.deepEqual([...entries.keys()], [
    "[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model",
  ]);
  const decoder = new TextDecoder();
  const relationships = decoder.decode(entries.get("_rels/.rels"));
  assert.match(relationships, /Target="\/3D\/3dmodel\.model"/);
  const xml = decoder.decode(entries.get("3D/3dmodel.model"));
  assert.match(xml, /unit="millimeter"/);
  assert.match(xml, /name="Base"/);
  assert.match(xml, /name="Beads_Black"/);
  assert.equal((xml.match(/<base /g) ?? []).length, 4);
  assert.equal((xml.match(/<component objectid=/g) ?? []).length, 5);
  assert.equal((xml.match(/<item objectid=/g) ?? []).length, 1);
  assert.equal((xml.match(/pid="1" pindex="[0-3]"/g) ?? []).length, 5);
  assert.equal(new TextDecoder().decode(archive.slice(0, 4)), "PK\u0003\u0004");
  assert.equal(new TextDecoder().decode(archive.slice(-22, -18)), "PK\u0005\u0006");
});
```

Run `npm test` and expect a missing-module failure.

- [ ] **Step 2: Write a store-only ZIP serializer**

Create `src/print/zip.ts`. Its public API is:

```ts
export type ZipEntry = { name: string; data: Uint8Array };
export function createStoredZip(entries: ZipEntry[]): Uint8Array;
```

Use `TextEncoder`, `Uint8Array`, `DataView`, and a small CRC-32 loop. Write little-endian ZIP local headers, central-directory headers, and one end-of-central-directory record. Use method `0`, UTF-8 names, and a fixed valid DOS timestamp so repeated exports are byte-identical.

Offsets that must be explicit:

- Local header: method 8, DOS time 10, DOS date 12, CRC 14, sizes 18/22, name length 26.
- Central header: method 10, DOS time 12, DOS date 14, CRC 16, sizes 20/24, name length 28, local offset 42.

Keep this deliberate simplification next to the writer:

```ts
// ponytail: store-only ZIP keeps export dependency-free; add deflate only if measured 50×50 files are impractical.
```

Reject duplicate names, names longer than 65535 bytes, and archives whose counts or offsets exceed classic ZIP limits. These are export trust-boundary checks, not a general ZIP library.

- [ ] **Step 3: Generate standards-based 3MF XML**

Create `src/print/threeMf.ts` with:

```ts
export function createThreeMfEntries(model: PrintableModel): ZipEntry[];
export function createThreeMf(model: PrintableModel): Uint8Array;
export function downloadThreeMf(model: PrintableModel, filename: string): void;
```

Call `validatePrintableModel` first and throw one joined error if invalid. Emit exactly these entries in this order:

```text
[Content_Types].xml
_rels/.rels
3D/3dmodel.model
```

`[Content_Types].xml` must declare `.rels` and `.model`. `_rels/.rels` must point to `/3D/3dmodel.model` with relationship type `http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel`.

The model document uses 3MF Core, `unit="millimeter"`, and:

1. One `<basematerials id="1">` resource containing only used AMS colors, each display color encoded as `#rrggbbff`.
2. One mesh object per printable part, starting at object ID 2, with `name`, `type="model"`, `pid="1"`, and the corresponding zero-based `pindex`.
3. One final components object whose components reference every part object.
4. One `<item>` in `<build>` referencing only the components object.

Escape XML names with a local five-character replacement helper (`&`, `<`, `>`, `"`, `'`). Serialize vertices and triangles directly from typed arrays. Do not introduce an XML dependency.

For the browser download:

```ts
const blob = new Blob([createThreeMf(model)], { type: "model/3mf" });
const url = URL.createObjectURL(blob);
const anchor = document.createElement("a");
anchor.href = url;
anchor.download = filename.endsWith(".3mf") ? filename : `${filename}.3mf`;
anchor.click();
URL.revokeObjectURL(url);
```

- [ ] **Step 4: Verify archive structure and commit**

```bash
npm test
git diff --check
git add src/print/zip.ts src/print/threeMf.ts tests/three-mf.test.mjs
git commit -m "feat: export grouped multi-material 3mf"
```

Expected: all tests pass and the archive begins and ends with the asserted ZIP signatures.

---

## Task 5: Preview the Exact Printable Geometry

**Files:**

- Modify `src/ThreePreview.tsx`.
- Modify `src/styles.css` only as needed for the preview canvas.

- [ ] **Step 1: State the component contract in code**

Change the component props to accept the already built model:

```ts
type ThreePreviewProps = {
  model: PrintableModel;
};
```

Remove the preview-only `BEAD_RADIUS`, `InstancedMesh`, and `createBeadGeometry` path. This is a replacement, not a second renderer.

- [ ] **Step 2: Convert print meshes directly to Three.js**

Add one local helper:

```ts
function toBufferGeometry(part: PrintablePart): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(part.vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(part.triangles, 1));
  geometry.computeVertexNormals();
  return geometry;
}
```

For each part, create one `THREE.Mesh` with `MeshStandardMaterial` using the matching `model.materials` color. Rotate the containing group by `-Math.PI / 2` around X so Z-up print geometry displays upright in Three.js. Use the model's physical bounds to fit the camera and controls. Preserve the existing renderer, lights, resize observer, and orbit interaction.

Dispose every created geometry and material in the effect cleanup.

- [ ] **Step 3: Build and inspect locally**

```bash
npm test
npm run dev
```

Open the local URL and verify:

- The rectangular base is visible.
- Adjacent circles touch and look moderately fused.
- Each top has a shallow center depression, not an open hole.
- Rotating the view reveals the exact 1.2 mm base and 0.8 mm relief proportions.
- Changing cells updates this model rather than the removed preview primitives.

- [ ] **Step 4: Commit**

```bash
git add src/ThreePreview.tsx src/styles.css
git commit -m "feat: preview exact printable geometry"
```

---

## Task 6: Add AMS and Print Controls, Then Wire Export

**Files:**

- Create `src/PrintSettingsPanel.tsx`.
- Modify `src/App.tsx`.
- Modify `src/styles.css`.
- Modify `tests/colors.test.mjs`.

- [ ] **Step 1: Add a failing palette-replacement test**

Append to `tests/colors.test.mjs`:

```js
import { withCells } from "../generated/dist/src/project.js";
import { replaceProjectColor } from "../generated/dist/src/print/colors.js";

test("changing an AMS slot updates cells and the base reference", () => {
  const project = withCells(createProject(2, 1), ["ams-1-1c1c1c", "ams-2-f4f1e8"]);
  const updated = replaceProjectColor(project, "ams-1-1c1c1c", "ams-1-333333");
  assert.deepEqual(updated.layers[0].cells, ["ams-1-333333", "ams-2-f4f1e8"]);
  assert.deepEqual(updated.cells, ["ams-1-333333", "ams-2-f4f1e8"]);
  assert.equal(updated.printSettings.baseColorId, "ams-1-333333");
  assert.equal(project.layers[0].cells[0], "ams-1-1c1c1c");
});
```

Run `npm test` and expect `replaceProjectColor` to be missing.

- [ ] **Step 2: Implement one immutable replacement helper**

Add to `src/print/colors.ts`:

```ts
export function replaceProjectColor(project: BeadProject, from: string, to: string): BeadProject {
  return {
    ...project,
    cells: project.cells.map((cell) => cell === from ? to : cell),
    layers: project.layers.map((layer) => ({
      ...layer,
      cells: layer.cells.map((cell) => cell === from ? to : cell),
    })),
    printSettings: {
      ...project.printSettings,
      baseColorId: project.printSettings.baseColorId === from ? to : project.printSettings.baseColorId,
    },
  };
}
```

Import the existing `BeadProject` type. Run `npm test` and expect the new test to pass.

- [ ] **Step 3: Add a controlled settings panel**

Create `src/PrintSettingsPanel.tsx` with this API:

```ts
type PrintSettingsPanelProps = {
  project: BeadProject;
  errors: string[];
  onChange: (project: BeadProject) => void;
  onExport: () => void;
};
```

Use native controls only:

- 1–4 AMS rows with color input and name input. Add the next slot and remove only the last slot, keeping encoded slot numbers stable.
- Changing a hex value regenerates its slot-based encoded ID and calls `replaceProjectColor`.
- Removing the last used slot first remaps its cells and base reference to AMS slot 1; disable removal when only one slot remains.
- Numeric inputs for pitch, base, bead height, dimple diameter, and dimple depth.
- A base-color `<select>` using active slots.
- Show physical X × Y × Z size, cell count, used material count, and inline validation messages.
- Disable Export while errors exist.

Use `min`, `max`, and `step` attributes, while still validating in the model layer. Keep labels associated with controls and buttons keyboard-accessible.

- [ ] **Step 4: Wire the active palette, model, preview, and export once**

In `src/App.tsx`, derive:

```ts
const activePalette = project.amsColors.map(amsColorToPaletteColor);
const printableModel = buildPrintableModel(composePrintableGrid(project));
const printErrors = validatePrintableModel(printableModel);
```

Then:

- Replace the MARD painting palette with `activePalette`.
- Pass `activePalette` to image conversion and set `maxColors` to its length.
- Restrict the file input with `accept="image/jpeg,image/png,image/webp"` and preserve the existing decode-error message.
- Remove the old 6–48 color-count slider.
- Set image-grid long-side default to 32 and range to 8–50.
- Render `PrintSettingsPanel` in the left column.
- Move `ThreePreview` to the right column and pass `printableModel`.
- Export with a filesystem-safe project name, falling back to `pingdou.3mf`.
- Catch generation/download exceptions in the existing app error state, leave the editable project unchanged, and show the concise error next to Export.
- Keep the upstream 2D editing, layers, undo/redo, project save/load, and image import paths.

Do not add state management or a component library.

- [ ] **Step 5: Style only the new controls and responsive placement**

Use the existing card, input, spacing, and breakpoint rules. Add only selectors needed for the four AMS rows, physical-size line, errors, and disabled export button. On narrow screens, stack the columns without horizontal scrolling.

- [ ] **Step 6: Verify and commit**

```bash
npm test
npm run build
git diff --check
git add src/App.tsx src/PrintSettingsPanel.tsx src/styles.css src/print/colors.ts tests/colors.test.mjs
git commit -m "feat: add AMS print controls and export flow"
```

Manual checks:

- Uploading JPG/PNG/WebP produces a 32-cell-long-side result by default.
- Uploading `docs/realistic-source.jpg` exercises the photographic path; `docs/cartoon-source.png` exercises transparent/cartoon input.
- One through four slots repaint and rematch predictably.
- Editing a slot color preserves all cells assigned to that slot.
- A 50 × 50 grid at 5 mm pitch is accepted; 50 × 50 above 5 mm shows the 250 mm error.
- Export remains disabled for invalid dimensions and enables after correction.

---

## Task 7: Generate a Deterministic Acceptance Sample and Document Local Use

**Files:**

- Create `scripts/generate-sample.mjs`.
- Modify `package.json`.
- Modify `README.md`.

- [ ] **Step 1: Add sample and verification scripts**

Add to `package.json`:

```json
"sample": "npm run build && node scripts/generate-sample.mjs",
"verify": "npm run build && node --test tests/*.test.mjs && node scripts/generate-sample.mjs"
```

- [ ] **Step 2: Generate one fixed 4 × 4, four-color panel**

Create `scripts/generate-sample.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";
import { validatePrintableModel } from "../generated/dist/src/print/validation.js";

const project = createProject(4, 4);
project.name = "pingdou-p2s-sample";
project.layers[0].cells = [
  "ams-1-1c1c1c", "ams-1-1c1c1c", "ams-2-f4f1e8", "ams-2-f4f1e8",
  "ams-1-1c1c1c", "ams-3-ed2b2b", "ams-3-ed2b2b", "ams-2-f4f1e8",
  "ams-4-2864dc", "ams-3-ed2b2b", "ams-3-ed2b2b", "ams-4-2864dc",
  "ams-4-2864dc", "ams-4-2864dc", "ams-1-1c1c1c", "ams-2-f4f1e8",
];

const model = buildPrintableModel(composePrintableGrid(project));
const errors = validatePrintableModel(model);
if (errors.length) throw new Error(errors.join("\n"));
if (model.parts.length !== 5 || model.materials.length !== 4) {
  throw new Error(`Expected 5 parts and 4 materials, got ${model.parts.length} and ${model.materials.length}`);
}
if (JSON.stringify(model.sizeMm) !== JSON.stringify({ x: 20, y: 20, z: 2 })) {
  throw new Error(`Unexpected sample size: ${JSON.stringify(model.sizeMm)}`);
}

await mkdir("samples", { recursive: true });
await writeFile("samples/pingdou-p2s-sample.3mf", createThreeMf(model));
console.log("samples/pingdou-p2s-sample.3mf: 5 parts, 4 materials, 20×20×2 mm");
```

- [ ] **Step 3: Document the shortest working flow**

Update `README.md` to cover:

1. `npm ci` and `npm run dev`.
2. Upload image → choose 1–4 AMS colors → adjust grid and print dimensions → export 3MF.
3. Bambu Studio: import as one object with multiple parts, map `Base` and `Beads_<name>` parts to AMS slots, select P2S 0.4 mm nozzle, then slice.
4. Defaults and the 250 mm application limit.
5. The local-only privacy statement and accepted image formats.
6. `npm run verify` for automated checks and sample generation.
7. Upstream attribution and license link.

Do not add deployment, cloud, account, or printer-upload instructions.

- [ ] **Step 4: Run the full non-GUI check**

```bash
npm run verify
unzip -t samples/pingdou-p2s-sample.3mf
git diff --check
git status --short
```

Expected:

- All Node tests pass.
- The sample reports `5 parts, 4 materials, 20×20×2 mm`.
- `unzip -t` verifies all three archive entries without errors.
- Only intended source, tests, docs, and generated sample changes appear.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/generate-sample.mjs README.md samples/pingdou-p2s-sample.3mf
git commit -m "docs: add P2S acceptance sample and workflow"
```

---

## Task 8: Prove Bambu Studio P2S Import and Slice Compatibility

**Files:**

- Create `docs/verification/bambu-studio-p2s.md`.
- Modify only the smallest source/test files needed if Bambu Studio exposes a real compatibility defect.

- [ ] **Step 1: Obtain the official slicer with explicit approval**

First check `/Applications`, `~/Applications`, and mounted volumes for Bambu Studio. If absent, request approval before downloading or mounting the current official macOS release. Record the exact version and download URL. Do not sign in, connect a printer, upload a file, or send a print.

- [ ] **Step 2: Import through the real GUI**

Using Computer Use, launch Bambu Studio and select:

```text
Printer: Bambu Lab P2S
Nozzle: 0.4 mm
Process: 0.20 mm Standard
```

Import `samples/pingdou-p2s-sample.3mf`. If prompted whether to load multiple volumes as one object with parts, choose the grouped-object option.

- [ ] **Step 3: Check the imported object before slicing**

Verify all of the following in the object/parts panel and prepare view:

- Exactly one top-level assembly.
- Parts named `Base`, `Beads_Black`, `Beads_White`, `Beads_Red`, and `Beads_Blue`.
- Four imported material/color resources.
- Approximate physical dimensions 20 × 20 × 2 mm.
- The object is on the bed and no repair warning appears.
- Assign `Base` and `Beads_Black` to AMS slot 1, then White/Red/Blue to slots 2/3/4.

- [ ] **Step 4: Slice and inspect the result**

Slice the plate and verify:

- Slicing completes without model or manifold errors.
- The first 1.2 mm is a continuous rectangular base.
- The relief extends to 2.0 mm total height.
- All four bead colors appear in the intended cells.
- The center depressions remain shallow closed dimples, not through-holes.
- No geometry is outside the P2S bed.

- [ ] **Step 5: Fix only a reproduced incompatibility, if present**

If import or slicing fails:

1. Capture the exact dialog/error and identify whether it concerns ZIP structure, 3MF relationships, component grouping, material assignment, mesh closure, or dimensions.
2. Add one failing assertion to `tests/three-mf.test.mjs`, `tests/geometry.test.mjs`, or `tests/model.test.mjs` that reproduces that category.
3. Make the smallest correction in the shared serializer/model/geometry path.
4. Run `npm run verify`, re-import a newly generated sample, and repeat Steps 2–4.

Do not add vendor-specific metadata unless the standard grouped 3MF demonstrably fails without it.

- [ ] **Step 6: Record acceptance evidence**

Create `docs/verification/bambu-studio-p2s.md` with this completed template:

```markdown
# Bambu Studio P2S Compatibility Check

- Date: 2026-07-30
- macOS version: <observed value>
- Bambu Studio version: <observed value>
- Download source: <official URL or existing installation>
- Printer profile: Bambu Lab P2S, 0.4 mm nozzle
- Process profile: 0.20 mm Standard
- Sample: `samples/pingdou-p2s-sample.3mf`
- Sample SHA-256: `<shasum -a 256 result>`
- Imported structure: one assembly, five named parts
- Material mapping: Base/Black→1, White→2, Red→3, Blue→4
- Imported dimensions: <observed X × Y × Z>
- Repair warning: none
- Slice result: pass
- Notes: <only observed deviations, or none>
```

Replace every angle-bracket field with the observed value; do not commit a partially completed template.

- [ ] **Step 7: Re-run evidence-producing checks and commit**

```bash
npm run verify
unzip -t samples/pingdou-p2s-sample.3mf
shasum -a 256 samples/pingdou-p2s-sample.3mf
git diff --check
git status --short
git log --oneline -8
```

Expected: automated checks and archive test pass, the recorded SHA matches the current sample, and the verification document reports a passing real slice.

```bash
git add docs/verification/bambu-studio-p2s.md
git add samples/pingdou-p2s-sample.3mf
git commit -m "test: verify P2S slice compatibility"
```

If Step 5 changed source or tests, inspect `git status --short` and add those exact named paths before the commit. Never use broad `git add src tests` here because unrelated user changes must remain untouched. The sample `git add` is harmless when no compatibility fix was required.

---

## Final Completion Audit

- [ ] Read the approved design spec and this implementation plan side by side; confirm every must-have is represented and every explicit non-goal remains absent.
- [ ] Run `npm run verify` from a clean shell.
- [ ] Run `unzip -t samples/pingdou-p2s-sample.3mf`.
- [ ] Confirm `git diff --check` is silent and inspect `git status --short` for unrelated files.
- [ ] Confirm the real Bambu Studio verification document has no angle-bracket placeholders.
- [ ] Inspect the current UI at desktop and narrow widths for upload, editing, AMS controls, preview, validation, and export.
- [ ] Use the verification-before-completion skill before claiming success.
- [ ] Mark the active Goal Mode goal complete only after all checks and the real P2S slice acceptance pass.
