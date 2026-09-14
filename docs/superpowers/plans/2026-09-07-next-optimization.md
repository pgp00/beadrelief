# BeadRelief Next Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed image-quality, edit-loss, project-recovery, and layered-print correctness defects before adding new capabilities.

**Architecture:** Keep fixes in the existing pure modules and React owner. Restore the distance contract used by conversion heuristics, reuse `resetAdjustments(false)` at history boundaries, use compact JSON plus IndexedDB with a restore-before-save gate, reject the unsupported layered-border combination, and handle an unavailable print model throughout the UI. Add a bounded per-conversion RGB cache only after correctness fixes land.

**Tech Stack:** React 18, TypeScript, browser Canvas/Web Storage/IndexedDB APIs, Three.js, Node test runner, Playwright Core.

## Global Constraints

- Add no dependencies.
- Preserve browser-only processing and the current project JSON schema.
- Preserve the current 180 × 180 pattern limit, 64-layer limit, and 32 × 32 3MF export limit.
- Update both Chinese and English for every new user-facing string.
- Each task must pass its focused test before the next task starts.
- Run `npm run verify` after all tasks; do not regenerate or commit unrelated files.
- The 2026-09-07 review did not implement these tasks. Checkboxes now track execution; the commit commands themselves are not evidence that changes have landed.

## Review findings and execution order — 2026-09-07

The eight items are separately reviewable deliverables, not eight independent parallel jobs. Tasks 2–6 all modify `App.tsx`; Tasks 2, 4, 5, and 6 share browser tests. Implement in the listed order, with Tasks 1–6 required for correctness, Task 7 for measured performance, and Task 8 for integration and print acceptance. Do not hold software fixes until a physical printer becomes available.

| Task | Priority | Evidence / prerequisite |
| --- | --- | --- |
| 1 — distance units | P1 | Black/white distance is `0.9999999935`, while heuristics compare against tens. The 8 × 8 regression produces 64 black cells. |
| 2 — adjustment boundaries | P0 | Browser probe confirmed adjust → Clear → adjust restores the deleted cell. `commitHistory()` does not reset adjustments; canvas editing, effects, color replacement, and undo/redo also retain the baseline. Reuse the existing reset function. |
| 3 — JSON round trip | P1 | Compact 180 × 180 / 64-layer fixtures are 21,069,634 bytes (MARD), 31,599,634 (AMS), and 37,919,360 (stack). All exceed the existing 20,971,520-byte limit. |
| 4 — draft durability | P0 | A 180 × 180 / 16-layer MARD draft measured 5,511,172 bytes and `saveDraft()` returned `false` in Chrome. Migration also needs initialization ordering, ordered writes, persistent failure status, and migration of existing localStorage-based browser assertions. |
| 5 — layered border | P1 | A 1 × 1 CMYW model with a 1 mm border validates with zero errors, despite a base-material border spanning all material bands. |
| 6 — 3MF preflight | P1 | `MAX_EXPORT_GRID_DIMENSION` is already exported. The proposed null model would crash `PrintSettingsPanel` / `ThreePreview` unless their callers are handled; the separate 50-cell UI cap also needs removal. |
| 7 — conversion cache | P2 | After one warm-up, an eight-color 104 × 104 cartoon fixture with the complete 291-color palette took 2714.6 / 2722.5 / 2719.9 ms in Node v26.0.0 on arm64. This is a synthetic baseline, not a real-photo browser measurement. |
| 8 — acceptance | Gate | Depends on Tasks 1–7. Automated regression, current-byte slicing, and physical printing have separate completion states. |

Review baseline: `npm run check` passed; 30 focused existing tests passed; the existing browser golden path passed without skips. The first browser attempt could not bind a loopback port in the sandbox (`EPERM`); the permitted local rerun passed. These checks do not cover the new regressions or constitute physical-print verification.

Separate diagnostic probes reproduced the black/white collapse, oversized JSON rejection, unsupported layered-border acceptance, adjustment-after-Clear restoration, and 16-layer draft save failure. The installed Playwright version supports filling range inputs, so the plan's slider interaction is usable. These are observations of the current defects, not passing tests of implemented fixes.

---

### Task 1: Restore the color-distance contract used by cleanup heuristics

**Files:**
- Modify: `src/palette.ts:377`
- Test: `tests/image-conversion.test.mjs`
- Test: `tests/image-adjustments.test.mjs`

**Interfaces:**
- Consumes: `colorDistance(a, b)` callers in `imageToBeads.ts` and `imageAdjustments.ts` whose thresholds use weighted-RGB units.
- Produces: `colorDistance(a, b): number` in the same units as those existing thresholds; `nearestPaletteColor()` remains Oklab-based.

- [x] **Step 1: Add the conversion regression**

Append a test that builds an 8 × 8 black/white image and asserts that cleanup does not merge its two halves:

```js
test("speckle cleanup preserves a strong black-white boundary", () => {
  const rgba = new Uint8ClampedArray(8 * 8 * 4);
  for (let index = 0; index < 64; index += 1) {
    const rgb = index % 8 < 4 ? [0, 0, 0] : [255, 255, 255];
    rgba.set([...rgb, 255], index * 4);
  }
  const result = rgbaToBeads(rgba, 8, 8, 8, 8, options({
    maxColors: 2,
    palette: [colors[0], colors[2]],
    speckleReduction: 1,
  }));
  assert.deepEqual(result.cells.slice(0, 8), [
    "black", "black", "black", "black",
    "white", "white", "white", "white",
  ]);
  assert.equal(new Set(result.cells).size, 2);
});
```

- [x] **Step 2: Run the test and confirm the current failure**

Run: `npm run build && node --test tests/image-conversion.test.mjs`

Expected: FAIL because cleanup returns one color for all 64 cells.

- [x] **Step 3: Restore weighted-RGB distance without changing nearest-color matching**

Replace only `colorDistance`:

```ts
export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const meanRed = (a[0] + b[0]) / 2;
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return Math.sqrt(
    (2 + meanRed / 256) * red * red
      + 4 * green * green
      + (2 + (255 - meanRed) / 256) * blue * blue,
  );
}
```

Keep `nearestPaletteColor()` unchanged so palette matching continues to use Oklab. Remove the now-unused `oklabDistance` import. Cover candidate selection / color limiting as well as cleanup: both also call `colorDistance()` and therefore change behavior with this fix.

- [x] **Step 4: Cover the intended merge behavior**

Use real palette IDs because `collectLayerColorStats()` calls `getColor()`; arbitrary test-only IDs are ignored. Import `mergeCloseLayerColors` and `completePalette`, then check both sides of the threshold:

```js
assert.deepEqual(
  mergeCloseLayerColors(['mard-h9', 'mard-h9', 'mard-h17'], completePalette, 1).cells,
  ['mard-h9', 'mard-h9', 'mard-h9'],
);
const separated = ['mard-h9', 'mard-h9', 'mard-p9'];
assert.deepEqual(mergeCloseLayerColors(separated, completePalette, 1).cells, separated);
```

The first assertion preserves an intended merge; the second catches the scale regression. Also retain exact expected cells for a no-cleanup, limited-color conversion so candidate-selection changes receive review.

- [x] **Step 5: Verify and commit**

Run: `npm run build && node --test tests/image-conversion.test.mjs tests/image-adjustments.test.mjs`

Expected: all focused tests PASS.

```bash
git add src/palette.ts tests/image-conversion.test.mjs tests/image-adjustments.test.mjs
git commit -m "fix: restore cleanup color distance scale"
```

### Task 2: Prevent adjustment sessions from overwriting later edits

**Files:**
- Modify: `src/App.tsx` (`commitHistory`, `resetAdjustments`, `updateAdjustment`, `undo`, `redo`, and their callers)
- Test: `tests/browser-golden.test.mjs`

**Interfaces:**
- Consumes: `adjustmentSessionRef`, `adjustments`, and `defaultAdjustments` already owned by `App`.
- Produces: `commitHistory(): void` ends the previous adjustment session by reusing `resetAdjustments(false)`; the first adjustment records history before capturing its new baseline.

- [x] **Step 1: Add a browser regression**

Add a separate test in the existing browser test file, create an 8 × 8 project, and exercise this sequence through accessible controls:

```js
await page.getByRole("tab", { name: "Adjust", exact: true }).click();
await page.getByLabel("Brightness").fill("1");
await canvas.focus();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("Enter");
await page.waitForFunction(() => {
  const draft = JSON.parse(localStorage.getItem("perler-beads-generator:draft"));
  return Boolean(draft && draft.layers[0].cells[1] !== null);
});
const afterPaint = await page.evaluate(() => localStorage.getItem("perler-beads-generator:draft"));
await page.getByRole("tab", { name: "Adjust", exact: true }).click();
await page.getByLabel("Brightness").fill("2");
await page.waitForFunction(
  (saved) => localStorage.getItem("perler-beads-generator:draft") !== saved,
  afterPaint,
);
```

Use a fresh seeded browser context for this 8 × 8 fixture, with its keyboard cursor at `(0, 0)` and cell 1 initially empty. Capture the post-edit cells after persistence completes; compare the full second-adjustment result with `adjustLayerCells(postEditCells, { ...defaultAdjustments, brightness: 2 }, activePalette)`. A timestamp change alone is not a correctness assertion. Task 4 will replace the localStorage waits with `loadDraft()` waits.

Cover these independent sequences with exact expected cells: adjust → paint → adjust; adjust → clear → adjust (stays empty); adjust → invert → adjust; adjust → undo → adjust; adjust → undo → redo → adjust. Also verify two consecutive slider changes share one undo step and Reset still restores the current session's baseline. Use existing accessible controls and isolated fixtures; do not append every scenario to the existing 60-second golden test.

- [x] **Step 2: Run the browser test and confirm the edit disappears**

Run: `npm run build && node --test tests/browser-golden.test.mjs`

Expected: FAIL because the second adjustment reapplies the pre-paint `baseCells` snapshot.

- [x] **Step 3: End sessions at the common history boundary**

Reuse the existing reset function rather than adding an equivalent helper:

```ts
function commitHistory() {
  resetAdjustments(false);
  setPast((items) => [...items.slice(-39), projectRef.current]);
  setFuture([]);
}
```

Reorder the new-session branch in `updateAdjustment()` so history reset cannot erase the just-captured baseline:

```ts
if (adjustmentSessionRef.current.layerId !== activeLayer.id) {
  commitHistory();
  adjustmentSessionRef.current = { layerId: activeLayer.id, baseCells: activeLayer.cells.slice() };
}
```

Call `resetAdjustments(false)` in `undo()` / `redo()` after confirming a history entry exists. Canvas edits, Clear, effects, color cleanup, recoloring, resizing, and layer/material changes already route through `commitHistory()`; inspect every caller before editing. Preserve the existing reset on layer/dimension changes and project replacement. End the session before applying a generated replacement even when generation does not record history.

- [x] **Step 4: Verify and commit**

Run: `npm run build && node --test tests/browser-golden.test.mjs`

Expected: PASS for every sequence in Step 1, including undo grouping and Reset; no edit is restored from an obsolete adjustment baseline.

```bash
git add src/App.tsx tests/browser-golden.test.mjs
git commit -m "fix: end adjustments before canvas edits"
```

### Task 3: Make every supported project JSON importable after export

**Files:**
- Modify: `src/project.ts:10`
- Modify: `src/exporters.ts:25-27`
- Modify: `src/App.tsx` (`exportEditRecord`)
- Modify: `src/i18n.tsx`
- Test: `tests/project-import.test.mjs`
- Test: `tests/exporters.test.mjs`

**Interfaces:**
- Produces: exported `serializeProject(project): string` in `exporters.ts` and a 50 MiB `MAX_PROJECT_FILE_BYTES` import boundary. Serialization measures its output against that same boundary before download.
- Consumes: `downloadProjectJson()` uses `serializeProject()`; `isSafeProjectImport()` continues to enforce the exported maximum. Keeping serialization in `exporters.ts` avoids a `project.ts` ↔ `print/recipe.ts` cycle.

- [x] **Step 1: Add maximum-project round-trip coverage**

Create 180 × 180 projects with 64 uniquely identified layers, a valid `activeLayerId`, and top-level `cells` synchronized with the visible composition. Cover `mard-a1`, an actual AMS ID, and a stack ID from `withStackTemplate()` / `buildStackPalette()`; the longest supported IDs determine the capacity requirement. Import `serializeProject` from the existing exporter module. For each project, assert:

```js
const serialized = serializeProject(project);
assert.ok(new Blob([serialized]).size <= MAX_PROJECT_FILE_BYTES);
assert.equal(isSafeProjectImport(JSON.parse(serialized), new Blob([serialized]).size), true);
assert.deepEqual(normalizeProject(JSON.parse(serialized)).layers, project.layers);
```

Also update the exporter test to assert downloaded project JSON contains no indentation-only lines.

- [x] **Step 2: Run focused tests and confirm the 20 MiB boundary fails**

Run: `npm run build && node --test tests/project-import.test.mjs tests/exporters.test.mjs`

Expected: FAIL for the legal 64-layer project at the current 20 MiB limit.

- [x] **Step 3: Centralize compact serialization and raise the bounded import limit**

In `project.ts`, change only the shared input boundary:

```ts
export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;
```

In `exporters.ts`, extract the existing serialization without indentation:

```ts
export function serializeProject(project: BeadProject): string {
  const serialized = JSON.stringify({ ...project, printRecipe: buildPrintRecipe(project) });
  if (new Blob([serialized]).size > MAX_PROJECT_FILE_BYTES) {
    throw new Error('Project JSON exceeds the import size limit.');
  }
  return serialized;
}

export function downloadProjectJson(project: BeadProject): void {
  downloadBlob(
    `${safeName(project.name || "拼豆编辑记录")}-编辑记录_perler.json`,
    serializeProject(project),
    "application/json",
  );
}
```

Import `MAX_PROJECT_FILE_BYTES` from `project.ts`. Add `src/App.tsx` / `src/i18n.tsx` to this task's modified files: catch serialization failure in `exportEditRecord()` and show a Chinese/English export-size message instead of announcing success. Test that an over-limit serialization triggers no download. A cell-count limit alone cannot bound arbitrarily long imported IDs or metadata, so do not promise that every schema-valid object fits into 50 MiB.

- [x] **Step 4: Verify and commit**

Run: `npm run build && node --test tests/project-import.test.mjs tests/exporters.test.mjs`

Expected: PASS; the legal maximum project exports below 50 MiB and imports successfully.

```bash
git add src/project.ts src/exporters.ts src/App.tsx src/i18n.tsx tests/project-import.test.mjs tests/exporters.test.mjs
git commit -m "fix: keep project export and import limits aligned"
```

### Task 4: Store large drafts in IndexedDB with safe legacy migration

**Files:**
- Modify: `src/project.ts:540-558`
- Modify: `src/App.tsx:110,308-321`
- Modify: `src/i18n.tsx`
- Test: `tests/browser-golden.test.mjs`

**Interfaces:**
- Produces: `saveDraft(project): Promise<boolean>` and `loadDraft(): Promise<BeadProject | null>` backed by one IndexedDB database/object store/key.
- Consumes: `App` loads the draft after mount and retains the existing 400 ms debounced save.

- [x] **Step 1: Add browser coverage for a draft above 5 MiB**

In an isolated browser context, use `page.evaluate()` to create a 180 × 180, 16-layer project with unique IDs and filled cells. Assert its serialized byte size exceeds 5 MiB, await `saveDraft(project)`, reload, and inspect both the restored UI and `await loadDraft()` for all 16 layers and their cells. Seed the legacy key once in another context and verify migration. Do not reuse the golden test's `addInitScript(() => localStorage.clear())` for reload coverage: that script runs again on reload.

Add explicit cases for delayed loading beyond 400 ms, editing before loading resolves, missing IndexedDB, failed/aborted write transactions, migration failure with legacy bytes retained, and consecutive saves where the latest project must win. The initialization-delay case must prove that the existing persisted draft is never replaced by the default blank project.

- [x] **Step 2: Run the browser test and confirm current localStorage failure**

Run: `npm run build && node --test tests/browser-golden.test.mjs`

Expected: `saveDraft()` returns `false` and the newer project is not restored. The current implementation catches `QuotaExceededError`, so do not expect that exception to escape. Do not assume the previous draft has exactly 15 layers; storage capacity depends on IDs and contents.

- [x] **Step 3: Replace synchronous draft persistence with the native database**

Keep the implementation in `project.ts`; do not add a storage abstraction or dependency. Use constants and one small opener:

```ts
const draftDatabase = "beadrelief";
const draftStore = "drafts";
let draftConnection: Promise<IDBDatabase> | undefined;

function openDraftDatabase(): Promise<IDBDatabase> {
  if (draftConnection) return draftConnection;
  draftConnection = new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open(draftDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(draftStore);
    request.onsuccess = () => {
      const database = request.result;
      if (failed) { database.close(); return; }
      database.onversionchange = () => {
        database.close();
        draftConnection = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      failed = true;
      reject(request.error);
    };
    request.onblocked = () => {
      failed = true;
      reject(new Error('Draft database unavailable.'));
    };
  }).catch((error) => {
    draftConnection = undefined;
    throw error;
  });
  return draftConnection;
}
```

Implement `saveDraft()` with `store.put(project, autosaveKey)` and resolve only when the transaction completes; `onerror` and `onabort` resolve `false`. Reuse one database connection/open promise so calls create write transactions in invocation order, and close/reset it on `versionchange`. Handle open errors and `blocked` without leaving the UI indefinitely waiting; close a late successful connection after an open has already failed.

Implement `loadDraft()` by reading IndexedDB first, validating the record's structure and normalizing it, then falling back to the legacy localStorage record and migrating it with `saveDraft()`. Retain legacy bytes until a successful database transaction. A valid database draft is authoritative. Legacy support here means reading/migrating old drafts; do not silently switch new writes back to localStorage and then load an older database record on the next launch. If database persistence is unavailable, retain the current editable project and report the save failure.

- [x] **Step 4: Adapt App initialization and persistent save status**

Initialize with `createProject()`, then gate autosave until loading settles. Use object identity rather than `updatedAt` as the edit guard: timestamps can collide or come from imported records.

```ts
const initialProjectRef = useRef(project);
const [draftLoaded, setDraftLoaded] = useState(false);

useEffect(() => {
  let cancelled = false;
  void loadDraft().then((draft) => {
    if (cancelled) return;
    if (draft) {
      setProject((current) => current === initialProjectRef.current ? draft : current);
    }
    setDraftLoaded(true);
  });
  return () => { cancelled = true; };
}, []);
```

`loadDraft()` must settle to a project or `null` on every handled storage error; test effect cancellation / StrictMode. Begin the save effect with `if (!draftLoaded) return`, and include `draftLoaded` in its dependencies. This prevents the 400 ms default-project write from racing restoration. Existing dimension and preview effects synchronize the restored project.

Await the debounced `saveDraft(project)` call. Track persistent save failure, updating it only for the current project / live effect so an older completion cannot mark a newer edit saved. Render a localized status with a stable accessible name, separate from the transient notice. Update tests that currently use an unqualified `getByRole('status')`. Remove the synchronous `beforeunload` write; the 400 ms debounce plus transaction completion is the durability boundary. Verify and document that immediate close before completion is not guaranteed to save.

Replace **every** direct localStorage draft read/wait in the browser golden test and Task 2 with asynchronous `loadDraft()` inspection. Wait on expected dimensions/cells/layers, not just a changed timestamp. Keep direct legacy-key access only in migration tests. `page.evaluate()` must import `/src/project.js` from the built server and await the exported function.

- [x] **Step 5: Verify and commit**

Run: `npm run build && node --test tests/project-import.test.mjs tests/browser-golden.test.mjs`

Expected: PASS; 16-layer reload restores all layers, legacy localStorage migrates, and a forced IndexedDB error leaves the persistent unsaved indicator visible.

```bash
git add src/project.ts src/App.tsx src/i18n.tsx tests/browser-golden.test.mjs
git commit -m "fix: persist large drafts in indexeddb"
```

### Task 5: Block layered borders until their material bands are represented correctly

**Files:**
- Modify: `src/print/validation.ts:75-105`
- Modify: `src/print/profile.ts` (calibration swatch border)
- Modify: `src/App.tsx:994-1014`
- Modify: `src/i18n.tsx`
- Test: `tests/model-features.test.mjs`
- Test: `tests/profile.test.mjs`
- Test: `tests/three-mf.test.mjs`
- Test: `tests/browser-golden.test.mjs`

**Interfaces:**
- Consumes: `validatePrintableModel(model, false)` before preview/export.
- Produces: a stable layered-border validation error and a localized actionable UI message.

- [x] **Step 1: Add the failing print-contract test**

```js
test("layered export rejects a full-height base-material border", () => {
  const project = withStackTemplate(createProject(1, 1), "cmyw");
  project.layers[0].cells = [buildStackPalette(project.amsColors).at(-1).id];
  project.printSettings.borderWidthMm = 1;
  const errors = validatePrintableModel(buildPrintableModel(composePrintableGrid(project)), false);
  assert.ok(errors.some((error) => /layered.*border/i.test(error)));
});
```

- [x] **Step 2: Run and confirm the unsupported combination currently validates**

Run: `npm run build && node --test tests/model-features.test.mjs`

Expected: FAIL because validation currently returns no layered-border error.

- [x] **Step 3: Reject the combination in the shared validator**

Within the layered branch add:

```ts
if (settings.borderWidthMm > 0) {
  errors.push("Layered mode does not support a full-height border yet. Set border width to 0 mm.");
}
```

Map this condition to concise Chinese and English guidance in `App` for both preview validation and the export action: `分层模式暂不支持边框，请将边框宽度设为 0 mm。` / `Layered mode does not support borders yet. Set border width to 0 mm.` Keep other validation failures visible. Do not implement banded border geometry in this release.

Add a browser assertion that a layered 1 mm border shows the actionable message, downloads nothing, and becomes exportable after setting the border to zero. Unit tests must also cover a zero-border layered model, an accepted solid border, and the rejection through the public `createThreeMf` / `createCompressedThreeMf` export paths. The border restriction must not disable unrelated hanging loops or detached bases.

Execution discovery: `calibrationProject()` hard-codes a 1 mm border, so the shared rejection would disable calibration exports. Generate calibration swatches with a 0 mm border instead; preserve their materials, stops, base and back text. Extend the existing profile test to assert a zero border and successful public 3MF export. Do not exempt calibration from the safety guard.

- [x] **Step 4: Verify and commit**

Run: `npm run build && node --test tests/model-features.test.mjs tests/profile.test.mjs tests/three-mf.test.mjs tests/browser-golden.test.mjs`

Expected: PASS; solid borders still export and layered borders are rejected before download.

```bash
git add src/print/validation.ts src/print/profile.ts src/App.tsx src/i18n.tsx tests/model-features.test.mjs tests/profile.test.mjs tests/three-mf.test.mjs tests/browser-golden.test.mjs
git commit -m "fix: reject unsupported layered borders"
```

### Task 6: Preflight 3MF size before geometry and align print controls

**Files:**
- Modify: `src/App.tsx:39-48,653-680,990-1022`
- Modify: `src/PrintSettingsPanel.tsx` (nullable model and guarded summary)
- Reuse: `src/print/validation.ts:5` (the limit is already exported)
- Test: `tests/task-5-ui.test.mjs`
- Test: `tests/browser-golden.test.mjs`

**Interfaces:**
- Produces: UI preflight and print controls that reuse the already-exported `MAX_EXPORT_GRID_DIMENSION`.
- Consumes: `App` must not call `buildPrintableModel()` when either project dimension exceeds the limit.

- [x] **Step 1: Add UI regressions**

Assert the 3D presets, canvas number inputs, resize clamp, and generation long-side control all stop at 32. In the browser test, switch a 50 × 50 project to 3D mode and assert the localized limit message appears, no page error/download occurs, and the project remains 50 × 50. Exercise both an imported project and an image-generated project with a pending source file, since changing output mode can trigger automatic regeneration.

Then resize back to 32 × 32 and immediately exercise preview/export while the 250 ms preview debounce is pending. Also cover 32 × 33 and 33 × 32. Check export enablement and the actual exported dimensions, not only preset text. Use browser module routing to count geometry-builder calls for the oversized snapshot if needed; do not add a production debug API just for the test.

- [x] **Step 2: Remove the invalid 50 × 50 preset and preflight the current project**

Import `MAX_EXPORT_GRID_DIMENSION` into `App`. Remove the 50 × 50 preset and replace **all** uses of `MAX_PRINT_WORKSPACE_DIMENSION = 50` with the shared limit. Enforce the current mode's limit on the actual width passed to `imageFileToBeads()` too: an HTML input `max` attribute does not clamp typed values. Test an oversized typed long-side value. Check both the current project and the actual debounced preview snapshot:

```ts
const printGridTooLarge = project.width > MAX_EXPORT_GRID_DIMENSION
  || project.height > MAX_EXPORT_GRID_DIMENSION;
const printableModel = useMemo(
  () => outputMode === "three-d" && !printGridTooLarge
    && previewProject.width <= MAX_EXPORT_GRID_DIMENSION
    && previewProject.height <= MAX_EXPORT_GRID_DIMENSION
    ? buildPrintableModel(composePrintableGrid(previewProject))
    : null,
  [outputMode, previewProject, printGridTooLarge],
);
```

In `exportThreeMf()`, capture `const exportProject = projectRef.current` after the animation-frame yield, check its dimensions, and use that same snapshot for geometry and filename. An earlier render's boolean is not a check of the actual export input.

Handle the null model in every consumer:

- `PrintSettingsPanel` accepts `model: PrintableModel | null`, uses `project.amsColors.length` for its material count, guards its geometry summary with `model && ...` and layered summary with `model?.layered`, and disables export while the model is unavailable. Keep settings editable so users can recover.
- In `App`, mount the print `ThreePreview` only when `printableModel` exists. Otherwise render the existing localized size guidance or a pending-preview state; do not pass `null!` into the component.
- Compute `printErrors` from the current oversize condition even when no model exists, and display the guidance persistently. Retain Task 5's actionable border error.

Switching to 3D must preserve the oversized project even when `pendingFile` exists. Use the existing generation cancellation/suppression mechanism in `selectOutputMode()` for this transition so changing the palette key or clamping the import setting cannot automatically replace the grid. A subsequent explicit resize or generation remains available. Do not silently crop on mode selection.

- [x] **Step 3: Verify and commit**

Run: `npm run build && node --test tests/task-5-ui.test.mjs tests/browser-golden.test.mjs tests/model.test.mjs`

Expected: PASS; 50 × 50 never builds print geometry and 32 × 32 still previews and exports.

```bash
git add src/App.tsx src/PrintSettingsPanel.tsx tests/task-5-ui.test.mjs tests/browser-golden.test.mjs
git commit -m "fix: preflight 3mf grid dimensions"
```

### Task 7: Cache repeated color matches within one image conversion

**Files:**
- Modify: `src/imageToBeads.ts:279-456`
- Test: `tests/image-conversion.test.mjs`
- Test: `tests/performance.test.mjs`

**Interfaces:**
- Produces: `cachedMatcher(candidates)` returns conversion-local `nearest(rgb)` functions with bounded RGB-key caches.
- Consumes: both palette-ranking and final candidate matching loops; no cache survives a conversion or crosses candidate arrays.

- [x] **Step 1: Add deterministic output coverage**

After Task 1 lands, freeze exact `cells`, `colorsUsed`, and `totalBeads` for deterministic repeated-color, gradient, and partial-alpha fixtures with cleanup on/off. Include realistic style's average fallback. Compare cached results with these pre-cache outputs; merely checking that IDs belong to the palette can pass when every cell maps to the wrong color.

Run the same pixels against two palettes in sequence and with two different `maxColors` values within the same palette. Assert exact output as well as ID membership. The latter case catches mixing the ranking palette and final candidate set, which two independent conversions alone do not establish.

- [x] **Step 2: Add an informational performance measurement**

In `tests/performance.test.mjs`, measure the same repeated-color 104 × 104 conversion before and after caching, on the same machine with the same palette, style, cleanup settings and build. Warm up once, run at least three measured conversions, and report the median using `t.diagnostic()` from the test callback. Add a deterministic mostly-unique gradient/noise case to expose cache-miss overhead. Do not add a CI timing threshold.

Record timings after Task 1 separately: its corrected candidate selection changes work done. The review's 2.7-second baseline predates that fix and must not be presented as a cache-only speedup.

- [x] **Step 3: Add a bounded per-call cache**

Inside `rgbaToBeads`, create separate caches for the active palette and selected candidates. Use the packed RGB integer as the key:

```ts
function cachedMatcher(candidates: PaletteColor[]) {
  // ponytail: cache up to 65,536 RGB matches per candidate set; profile misses before increasing it.
  const cache = new Map<number, PaletteColor>();
  return (rgb: [number, number, number]) => {
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    const cached = cache.get(key);
    if (cached) return cached;
    const color = nearestPaletteColor(rgb, candidates);
    if (cache.size < 65_536) cache.set(key, color);
    return color;
  };
}
```

Create one matcher for the active palette before ranking and one for the selected candidates after selection. Pass them into `rankPaletteColors()` and `chooseCellColor()`, including `chooseCellColor()`'s average fallback. Keep the cache private to each candidate set and conversion. RGB packing is valid here because source samples and averages are rounded to byte-valued channels; retain that invariant. Each of the two caches has its own 65,536-entry ceiling, so the total ceiling is 131,072 entries per conversion.

Execution preflight: the current options check allows finite background channels outside 0–255, and alpha compositing can then produce non-byte samples when cleanup is off. Enforce 0–255 background channels at the existing `rgbaToBeads()` options boundary and add a rejection regression before enabling packed keys. Preserve in-range fractional background values, which compositing already rounds. Do not add a per-match hot-loop guard or accept colliding packed keys.

- [x] **Step 4: Verify output and inspect the benchmark**

Run: `npm run build && node --test tests/image-conversion.test.mjs tests/performance.test.mjs`

Expected: exact output regression tests PASS and repeated-color median improves against the post-Task-1 baseline; record cache-miss overhead as well. Before planning a Worker, measure the full `imageFileToBeads()` path for an available representative photo in a browser, including decode, Canvas sampling, conversion, and UI work. Record browser/device, source and output dimensions, palette, and long-task durations. Synthetic Node timings or the existing pixel-art heart alone cannot establish the real-photo Worker requirement.

- [x] **Step 5: Commit**

```bash
git add src/imageToBeads.ts tests/image-conversion.test.mjs tests/performance.test.mjs
git commit -m "perf: reuse image color matches"
```

### Task 8: Final regression and current-byte print verification

Track automated checks, slicer checks, and physical printing separately. Missing printer access leaves the relevant manual checkbox open; it does not invalidate a completed software regression check or authorize a print-time / color-accuracy claim.

**Files:**
- Modify after manual verification: `docs/verification/bambu-studio-p2s.md`
- Modify if samples change: `SHA256SUMS`

**Interfaces:**
- Consumes: all preceding commits and the current sample bytes.
- Produces: automated regression evidence and a manual record tied to exact SHA-256 values.

- [x] **Step 1: Run the complete repository verification (automated gate)**

Run: `npm run check && npm run verify && git diff --exit-code -- samples && node scripts/generate-checksums.mjs --check`

Expected: all commands exit 0; generated sample bytes and checksums remain deterministic. Verify browser tests actually ran (provide a local Chrome/Chromium executable if needed); a skipped browser suite is not this gate passing. The generator builds fixed grids rather than invoking image conversion, so the planned color-distance fix should not itself change sample bytes. If any bytes do change, investigate and review the difference before updating hashes. If samples did not change, do not modify or stage `SHA256SUMS`.

- [ ] **Step 2: Import the current samples into Bambu Studio (manual slicer gate)**

Record Bambu Studio version, printer, 0.4 mm nozzle, sample SHA-256, project-filament assignments, physical AMS mapping, slice layer height, and material-change layers. For the current layered fixture that reaches stop level 16, confirm every complete material band above the base slices into four 0.08 mm layers. Record the base layers separately: base thickness is not part of the first four-layer color band. Other projects may stop partway through their final material band; do not require an intentionally truncated band to contain four layers.

- [ ] **Step 3: Perform and record one physical sample print (manual physical gate)**

Record measured X/Y/Z dimensions, layer bonding, visible color result, and any AMS remapping required. Update only factual observations in `docs/verification/bambu-studio-p2s.md`; retain the existing warning if the physical print is not completed.

- [ ] **Step 4: Commit the verification record**

```bash
git add docs/verification/bambu-studio-p2s.md
git commit -m "docs: record current bambu verification"
```

Run this documentation commit only when new factual observations exist. Stage `SHA256SUMS` separately only if a reviewed sample-byte change required regenerating it. Software completion, slicer completion, and physical completion must each be stated accurately in the handoff.

## Deferred Until Evidence Requires It

- Web Worker conversion: reconsider only if representative real-photo browser measurements still show conversion-attributable main-thread tasks above 50 ms after Task 7. Record that evidence first.
- 3MF grids above 32 × 32: requires a separate product and geometry plan.
- Banded layered borders: implement only if users need the combination after Task 5 makes the limitation explicit.
- A storage abstraction or third-party IndexedDB package: the single draft record does not justify either.
