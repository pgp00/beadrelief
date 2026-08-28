# Bambu Auto-Color 3MF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Pingdou 3MF open in Bambu Studio with its project-filament colors and part assignments already present, while retaining a standards-readable core model.

**Architecture:** Keep the existing printable model and store-only ZIP exporter as the source of truth. Add two deterministic Bambu metadata entries derived from the model's ordered material list, and map every physical part to a one-based project-filament index by `materialId`; do not copy a complete printer/process profile.

**Tech Stack:** TypeScript, browser-native APIs, existing dependency-free ZIP writer, Node's built-in test runner, Bambu Studio 02.08.02.61.

## Global Constraints

- One `Export 3MF` action produces one archive; do not add a second exporter or download choice.
- New projects start with exactly three active slots: white base, black, red; the existing action may add an editable fourth slot.
- Imported existing projects preserve their material count, order, names, colors, and base selection.
- The archive keeps its standard 3MF geometry and material declarations and adds only the minimum Bambu metadata required for project-filament colors and part assignments.
- Do not embed AMS identity, account data, credentials, network behavior, generated G-code, thumbnails, or a complete P2S process profile.
- Physical AMS mapping remains a print-time confirmation in Bambu Studio.
- Add no dependency.
- Preserve the user-edited heart file before any sample generator can overwrite it.

---

### Task 1: Default new projects to three editable colors

**Files:**
- Modify: `src/print/colors.ts`
- Modify: `src/project.ts`
- Modify: `tests/colors.test.mjs`

**Interfaces:**
- Consumes: existing `AmsColor`, `DEFAULT_AMS_COLORS`, `createProject`, `normalizeProject`, and `PrintSettingsPanel` add/remove behavior.
- Produces: `DEFAULT_ACTIVE_AMS_COLORS: AmsColor[]`; new projects and projects missing AMS data use its white/black/red order, while `DEFAULT_AMS_COLORS[3]` remains the fourth-slot preset.

- [ ] **Step 1: Preserve the user-edited Bambu evidence**

Run:

```bash
mkdir -p /private/tmp/pingdou-user-evidence
cp samples/pingdou-heart-p2s.3mf /private/tmp/pingdou-user-evidence/pingdou-heart-p2s-bambu-edited.3mf
shasum -a 256 samples/pingdou-heart-p2s.3mf /private/tmp/pingdou-user-evidence/pingdou-heart-p2s-bambu-edited.3mf
```

Expected: both hashes are identical. Do not run `npm run verify` until this copy exists.

- [ ] **Step 2: Write the failing default and preservation tests**

Update `tests/colors.test.mjs` so the default assertions are explicit:

```js
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
```

Update assertions that intentionally use the default palette to reference `project.amsColors[index].id` instead of the old hard-coded black-first IDs. Keep explicit legacy-ID tests unchanged.

- [ ] **Step 3: Run the focused test and confirm the red state**

Run:

```bash
npm run build
node --test tests/colors.test.mjs
```

Expected: the new default-order test fails because `createProject()` still returns four black-first slots.

- [ ] **Step 4: Implement the minimal defaults**

Change `src/print/colors.ts` to keep four available presets but expose the active three:

```ts
export const DEFAULT_AMS_COLORS: AmsColor[] = [
  { id: 'ams-1-f4f1e8', name: 'White', hex: '#f4f1e8', tdMm: 1 },
  { id: 'ams-2-1c1c1c', name: 'Black', hex: '#1c1c1c', tdMm: 1 },
  { id: 'ams-3-ed2b2b', name: 'Red', hex: '#ed2b2b', tdMm: 1 },
  { id: 'ams-4-2864dc', name: 'Blue', hex: '#2864dc', tdMm: 1 },
];

export const DEFAULT_ACTIVE_AMS_COLORS = DEFAULT_AMS_COLORS.slice(0, 3);
```

In `src/project.ts`, import `DEFAULT_ACTIVE_AMS_COLORS`, use it in `createProject()`, and use it when `normalizeAmsColors()` receives no colors:

```ts
amsColors: DEFAULT_ACTIVE_AMS_COLORS.map((color) => ({ ...color })),
```

```ts
const source = colors?.length ? colors.slice(0, 4) : DEFAULT_ACTIVE_AMS_COLORS;
```

Do not change `PrintSettingsPanel.addColor()`; it must continue reading the fourth preset from `DEFAULT_AMS_COLORS[3]`.

- [ ] **Step 5: Run focused and full non-generating tests**

Run:

```bash
npm run build
node --test tests/colors.test.mjs tests/stacking.test.mjs tests/model.test.mjs
```

Expected: all selected tests pass. Do not regenerate tracked samples in this task.

- [ ] **Step 6: Commit**

```bash
git add src/print/colors.ts src/project.ts tests/colors.test.mjs
git diff --cached --name-only
git commit -m "feat: default to three editable AMS colors"
```

Expected: only the three listed files are committed; the user-edited heart 3MF remains unstaged.

---

### Task 2: Embed deterministic Bambu color assignments

**Files:**
- Modify: `src/print/model.ts`
- Modify: `src/print/threeMf.ts`
- Modify: `src/print/validation.ts`
- Modify: `tests/three-mf.test.mjs`

**Interfaces:**
- Consumes: `PrintableModel.materials`, `PrintableModel.parts`, `PrintablePart.materialId`, `ZipEntry`, `createStoredZip`, and `validatePrintableModel`.
- Produces: `createThreeMfEntries(model)` entries `Metadata/project_settings.config` and `Metadata/model_settings.config`; every part receives the one-based index of its matching `model.materials` entry.

- [ ] **Step 1: Write failing archive-structure and mapping tests**

Extend the first test in `tests/three-mf.test.mjs` to expect five entries:

```js
assert.deepEqual([...entries.keys()], [
  "[Content_Types].xml",
  "_rels/.rels",
  "3D/3dmodel.model",
  "Metadata/project_settings.config",
  "Metadata/model_settings.config",
]);
```

Add helpers and assertions:

```js
const decoder = new TextDecoder();
const projectSettings = JSON.parse(decoder.decode(entries.get("Metadata/project_settings.config")));
assert.deepEqual(projectSettings.filament_colour, model.materials.map((material) => material.hex.toUpperCase()));
assert.deepEqual(projectSettings.filament_type, model.materials.map(() => "PLA"));

const modelSettings = decoder.decode(entries.get("Metadata/model_settings.config"));
model.parts.forEach((part, index) => {
  const materialIndex = model.materials.findIndex((material) => material.id === part.materialId);
  assert.notEqual(materialIndex, -1);
  assert.match(
    modelSettings,
    new RegExp(`<part id="${index + 1}"[\\s\\S]*?key="extruder" value="${materialIndex + 1}"`),
  );
});
```

Add a rejection test that constructs a valid model, replaces one part's `materialId` with `missing`, and asserts `createThreeMf()` throws `/references a missing material/`.

Add a second rejection assertion that changes one material hex to `white` and asserts `createThreeMf()` throws `/six-digit hex color/`.

In the layered test, decode `Metadata/model_settings.config`, assert it has one part entry per physical band, and continue asserting the standard model has no `Estimated_` objects.

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```bash
npm run build
node --test tests/three-mf.test.mjs
```

Expected: failure because both `Metadata/*.config` entries are absent.

- [ ] **Step 3: Preserve all configured material slots in the printable model**

In `buildSolidPrintableModel()` in `src/print/model.ts`, keep the full ordered `grid.materials` list in `model.materials`; continue generating mesh parts only for colors actually used:

```ts
const materials = grid.materials.map((material) => ({ ...material }));
```

Remove the `usedIds` filter. This preserves slots 1–3 and an optional slot 4 for Bambu's project-filament list without creating empty mesh parts.

- [ ] **Step 4: Validate colors before metadata generation**

Add this material check next to the existing material-count and material-name checks in `src/print/validation.ts`:

```ts
if (model.materials.some((material) => !/^#[0-9a-f]{6}$/i.test(material.hex))) {
  errors.push('Every material needs a six-digit hex color.');
}
```

The common `validatePrintableModel()` call must reject malformed colors before either the standard XML or Bambu JSON is produced.

- [ ] **Step 5: Add minimal deterministic Bambu metadata**

In `src/print/threeMf.ts`, append the two metadata entries after the core model entry:

```ts
return [
  { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml()) },
  { name: '_rels/.rels', data: encoder.encode(relationshipsXml()) },
  { name: '3D/3dmodel.model', data: encoder.encode(modelXml(model)) },
  { name: 'Metadata/project_settings.config', data: encoder.encode(projectSettingsJson(model)) },
  { name: 'Metadata/model_settings.config', data: encoder.encode(modelSettingsXml(model)) },
];
```

Use partial project settings so Bambu merges its own current printer/process defaults:

```ts
function projectSettingsJson(model: PrintableModel): string {
  return `${JSON.stringify({
    filament_colour: model.materials.map((material) => material.hex.toUpperCase()),
    filament_type: model.materials.map(() => 'PLA'),
  }, null, 4)}\n`;
}
```

Generate one explicit extruder assignment for every physical part:

```ts
function modelSettingsXml(model: PrintableModel): string {
  const objectId = 2 + model.parts.length;
  const parts = model.parts.map((part, index) => {
    const materialIndex = model.materials.findIndex((material) => material.id === part.materialId);
    if (materialIndex < 0) throw new Error(`${part.name} references a missing material.`);
    return `    <part id="${index + 1}" subtype="normal_part">
      <metadata key="name" value="${escapeXml(part.name)}"/>
      <metadata key="extruder" value="${materialIndex + 1}"/>
    </part>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${objectId}">
    <metadata key="name" value="${escapeXml(model.name)}"/>
${parts}
  </object>
</config>`;
}
```

Add these two model metadata elements immediately inside the root `<model>` so Bambu recognizes package version 1 without pretending that Bambu Studio created the file:

```xml
<metadata name="Application">Pingdou-0.1.0</metadata>
<metadata name="BambuStudio:3mfVersion">1</metadata>
```

Declare `xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"` on the root model element. Do not add thumbnails, slice info, a plate block, or printer settings unless the Task 4 GUI acceptance proves one is strictly required.

- [ ] **Step 6: Run the focused test and inspect the archive**

Run:

```bash
npm run build
node --test tests/three-mf.test.mjs
```

Expected: all 3MF tests pass, the archive is byte-deterministic, both config entries parse, and layered preview-only colors remain absent.

- [ ] **Step 7: Run all Node tests without regenerating samples**

Run:

```bash
npm test
```

Expected: all Node tests pass. The tracked heart sample is still the user-edited evidence because `npm test` does not run sample generators.

- [ ] **Step 8: Commit**

```bash
git add src/print/model.ts src/print/threeMf.ts src/print/validation.ts tests/three-mf.test.mjs
git diff --cached --name-only
git commit -m "feat: embed Bambu color assignments in 3mf"
```

---

### Task 3: Update export feedback and deterministic samples

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `src/App.tsx`
- Modify: `scripts/generate-sample.mjs`
- Modify: `tests/colors.test.mjs`
- Modify: `tests/three-mf.test.mjs`
- Modify: `samples/pingdou-p2s-sample.3mf`
- Modify: `samples/pingdou-p2s-layered-sample.3mf`
- Modify: `samples/pingdou-heart-project.json`
- Modify: `samples/pingdou-heart-p2s.3mf`
- Modify: `docs/verification/bambu-studio-p2s.md`
- Modify: `docs/release-v0.1.0.md`

**Interfaces:**
- Consumes: the Task 1 white/black/red defaults and Task 2 metadata entries.
- Produces: regenerated fixtures that all contain Bambu color assignments, updated factual hashes, and localized success copy that accurately describes the new export.

- [ ] **Step 1: Write the failing success-copy assertion**

In the existing first-use UI test, assert the English and Chinese export messages include the Bambu color assignment and physical-slot confirmation meanings:

```js
assert.match(source, /Bambu colors included/);
assert.match(source, /已包含 Bambu 颜色分配/);
assert.match(source, /confirm.*AMS/i);
assert.match(source, /确认.*AMS/);
```

Run:

```bash
npm run build
node --test tests/task-5-ui.test.mjs
```

Expected: failure on the old instruction to assign AMS slots manually.

- [ ] **Step 2: Update the localized export feedback**

Replace the successful export notice in `src/App.tsx` with:

```ts
setNotice(language === 'zh'
  ? '3MF 已导出，已包含 Bambu 颜色分配；打印前请确认实际 AMS 槽位。'
  : '3MF exported with Bambu colors included; confirm the physical AMS slots before printing.');
```

- [ ] **Step 3: Make the fixed samples use explicit intended slots**

In `scripts/generate-sample.mjs`, add the fourth preset explicitly for the four-color fixture and derive cells from the project's actual material IDs rather than stale literals:

```js
import { DEFAULT_AMS_COLORS } from "../generated/dist/src/print/colors.js";

project.amsColors.push({ ...DEFAULT_AMS_COLORS[3] });
const [white, black, red, blue] = project.amsColors;
```

Use `white.id`, `black.id`, `red.id`, and `blue.id` in its 4 × 4 cell matrix.

For the heart fixture, remove the old `slice(0, 3)`, set `baseColorId` to `heartProject.amsColors[0].id`, and map `.` to slot 1 white, `#` to slot 2 black, and `R` to slot 3 red. Update the heart test to assert the new IDs dynamically from the project's ordered colors.

- [ ] **Step 4: Regenerate and verify every fixed archive**

Run:

```bash
npm run verify
git diff -- samples
for file in samples/*.3mf; do unzip -t "$file"; done
```

Expected: all tests pass; each tracked 3MF contains both `Metadata/project_settings.config` and `Metadata/model_settings.config`; the heart project uses white/black/red slot order; ZIP integrity passes.

- [ ] **Step 5: Record exact new hashes and remove stale manual-assignment claims**

Run:

```bash
shasum -a 256 samples/pingdou-heart-source.png samples/pingdou-heart-project.json samples/pingdou-heart-p2s.3mf samples/pingdou-p2s-sample.3mf samples/pingdou-p2s-layered-sample.3mf
```

Replace the corresponding old hashes in `docs/verification/bambu-studio-p2s.md` and `docs/release-v0.1.0.md` with the command output. In those files plus `README.md` and `README.zh-CN.md`, change statements that say part assignment is always manual to: project-filament colors and part assignments are included; physical AMS mapping must be confirmed before printing. Keep the three-step Bambu handoff accurate in both languages. Do not add a slice or physical-print pass claim.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
node --test tests/colors.test.mjs tests/three-mf.test.mjs tests/task-5-ui.test.mjs
git add samples/pingdou-p2s-sample.3mf samples/pingdou-p2s-layered-sample.3mf samples/pingdou-heart-project.json samples/pingdou-heart-p2s.3mf
npm run verify
git diff --exit-code -- samples
git diff --check
```

Expected: focused tests and the full suite pass; a second generator run leaves all samples byte-identical; no whitespace errors.

- [ ] **Step 7: Commit**

```bash
git add README.md README.zh-CN.md src/App.tsx scripts/generate-sample.mjs tests/colors.test.mjs tests/three-mf.test.mjs tests/task-5-ui.test.mjs samples/pingdou-p2s-sample.3mf samples/pingdou-p2s-layered-sample.3mf samples/pingdou-heart-project.json samples/pingdou-heart-p2s.3mf docs/verification/bambu-studio-p2s.md docs/release-v0.1.0.md
git diff --cached --name-only
git commit -m "feat: ship auto-colored Bambu 3mf samples"
```

Expected: the source PNG is unchanged, and `/private/tmp/pingdou-user-evidence/pingdou-heart-p2s-bambu-edited.3mf` still matches the preserved user evidence hash.

---

### Task 4: Prove fresh Bambu Studio import behavior

**Files:**
- Modify: `docs/verification/bambu-studio-p2s.md`

**Interfaces:**
- Consumes: the regenerated solid heart and layered fixtures from Task 3.
- Produces: a dated factual acceptance record for Bambu Studio 02.08.02.61; no source interface.

- [ ] **Step 1: Start from a clean Bambu Studio session**

Quit Bambu Studio, confirm no project is open, and launch Bambu Studio 02.08.02.61 without loading a previously saved Pingdou project.

Expected: an empty new session; no user-edited evidence file is modified.

- [ ] **Step 2: Test the heart without manual part editing**

Open `samples/pingdou-heart-p2s.3mf` and do not change any object/part extruder assignment.

Expected before any manual assignment:

- the model shows a white base, black outline, and red fill;
- project filaments show white, black, and red;
- the object parts already reference those project filaments.

Switch to Bambu Lab P2S and 0.4 mm nozzle.

Expected: all color assignments remain intact and Bambu still allows mapping the three project filaments to physical AMS slots.

- [ ] **Step 3: Test four-slot and layered fixtures**

Open `samples/pingdou-p2s-sample.3mf` in another clean project.

Expected: four project colors appear and every physical part is already colored.

Open `samples/pingdou-p2s-layered-sample.3mf` in another clean project.

Expected: its physical bands map to their bottom-to-top project filaments and no preview-only `Estimated_*` part appears.

- [ ] **Step 4: Record only observed facts**

Add a dated `Auto-color metadata acceptance` subsection to `docs/verification/bambu-studio-p2s.md` containing:

- Bambu Studio `02.08.02.61`;
- macOS version;
- pass/fail for heart colors before manual editing;
- pass/fail for three project filaments;
- pass/fail after selecting P2S/0.4 mm;
- pass/fail for the four-color fixture;
- pass/fail for layered physical bands;
- confirmation that physical AMS mapping remains user-controlled.

Do not enter print time, material use, slicing, or physical-print results during this metadata-only acceptance.

- [ ] **Step 5: Run final verification**

Run:

```bash
npm run verify
git diff --exit-code -- samples
for file in samples/*.3mf; do unzip -t "$file"; done
git diff --check
git status --short
```

Expected: all automated checks pass; samples are deterministic; only the verification record is uncommitted.

- [ ] **Step 6: Commit the acceptance record**

```bash
git add docs/verification/bambu-studio-p2s.md
git diff --cached --name-only
git commit -m "docs: verify automatic Bambu color import"
```

Release remains blocked on the separate real slice screenshot, sub-30-minute estimate and wall-clock print, completion evidence, and physical photograph.
