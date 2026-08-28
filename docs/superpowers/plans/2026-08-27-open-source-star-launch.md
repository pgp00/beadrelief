# Pingdou Open-Source Star Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Pingdou v0.1.0 as a trustworthy, zero-install, proof-first open-source project whose shortest path is image → editable bead relief → validated multicolor 3MF → Bambu Studio → real print.

**Architecture:** Keep the existing static React/TypeScript application and its single browser-local project model. Reuse the current conversion pipeline, printable model, validator, 3MF writer, Node test runner, sample scripts, and GitHub Pages workflow. Put safety checks at their shared boundaries: imported settings in project normalization, export limits in print validation, and replacement/regeneration decisions in small pure helpers used by the app.

**Tech Stack:** React 18, TypeScript, Three.js, Node.js 22.9+, npm 11.17.0, Node's built-in test runner, GitHub Actions, GitHub Pages, Bambu Studio on P2S with a 0.4 mm nozzle.

## Global Constraints

- Canonical repository URL for this plan: `https://github.com/pgp00/pingdou`; canonical demo URL: `https://pgp00.github.io/pingdou/`. If the owner changes, replace these two strings everywhere in one commit before publishing.
- Preserve the existing `LICENSE` and `UPSTREAM.md`; do not rewrite or remove the Jett-Wu MIT notice or imported commit provenance.
- Preserve the current uncommitted refactor in `src/App.tsx`, `src/WorkspaceCanvas.tsx`, `src/canvasGeometry.ts`, `src/i18n.tsx`, `src/imageAdjustments.ts`, `tests/canvas-geometry.test.mjs`, and `tests/image-adjustments.test.mjs`. Before touching one of those paths, review its current diff. Stage only launch-specific hunks with `git add -p`; never sweep the whole dirty tree into a launch commit.
- Before implementation, use `superpowers:using-git-worktrees`. Because the working tree is dirty, do not move or discard it; create an isolated worktree from `main`, then deliberately port only the already-reviewed refactor hunks needed by a task.
- Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before any completion claim.
- Do not add runtime or test dependencies. Use Node assertions, browser APIs, CSS, the current build scripts, and installed packages.
- Do not add analytics, accounts, a backend, cloud uploads, PWA packaging, crop UI, printer upload, Bambu-private metadata, browser automation, a second landing application, or a geometry/compression rewrite.
- Do not publish a release or announcement until `docs/pingdou-heart-bambu-slice.webp` and `docs/pingdou-printed-result.jpg` are real maintainer-owned evidence and both estimated and actual print time are below 30 minutes.
- Commit after each task only when its checks pass. Use the exact scoped `git add` paths listed in that task and confirm `git diff --cached --name-only` before committing.

---

## Task 1: Establish repository identity and reproducible tooling

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/write-html.cjs`
- Test: `package-lock.json`

- [ ] **Step 1: Add a failing metadata check**

Run:

```bash
node -e "const p=require('./package.json'); const ok=p.name==='pingdou'&&p.repository?.url==='https://github.com/pgp00/pingdou.git'&&p.homepage==='https://pgp00.github.io/pingdou/'&&p.bugs?.url==='https://github.com/pgp00/pingdou/issues'&&p.engines?.node==='>=22.9.0'&&p.packageManager==='npm@11.17.0'; if(!ok) process.exit(1)"
```

Expected: exit code `1` because the launch metadata is absent.

- [ ] **Step 2: Add only the canonical package metadata**

Set these fields in `package.json` without changing dependencies:

```json
{
  "name": "pingdou",
  "version": "0.1.0",
  "description": "Turn any image into an editable, multicolor 3MF bead relief — locally in your browser.",
  "private": true,
  "homepage": "https://pgp00.github.io/pingdou/",
  "repository": {
    "type": "git",
    "url": "https://github.com/pgp00/pingdou.git"
  },
  "bugs": {
    "url": "https://github.com/pgp00/pingdou/issues"
  },
  "engines": {
    "node": ">=22.9.0"
  },
  "packageManager": "npm@11.17.0"
}
```

- [ ] **Step 3: Canonicalize lockfile registry URLs**

Run:

```bash
npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org/
rg -n "npmmirror|registry\.yarnpkg" package-lock.json
```

Expected: npm updates only dependency metadata; `rg` returns no matches.

- [ ] **Step 4: Align built-page identity**

In `scripts/write-html.cjs`, set:

```html
<html lang="en">
<meta name="description" content="Turn any image into an editable, multicolor 3MF bead relief — locally in your browser." />
<title>Pingdou — Image to editable multicolor 3MF</title>
<link rel="canonical" href="https://pgp00.github.io/pingdou/" />
```

Do not add an analytics script or social-tracking pixel.

- [ ] **Step 5: Verify metadata and build**

Run:

```bash
node -e "const p=require('./package.json'); const ok=p.name==='pingdou'&&p.repository?.url==='https://github.com/pgp00/pingdou.git'&&p.homepage==='https://pgp00.github.io/pingdou/'&&p.bugs?.url==='https://github.com/pgp00/pingdou/issues'&&p.engines?.node==='>=22.9.0'&&p.packageManager==='npm@11.17.0'; if(!ok) process.exit(1)"
npm ci
npm run build
rg -n "Pingdou — Image to editable multicolor 3MF|pgp00.github.io/pingdou" generated/dist/index.html
```

Expected: all commands exit `0`; built HTML contains the new title and canonical URL.

- [ ] **Step 6: Commit the scoped change**

```bash
git add package.json package-lock.json scripts/write-html.cjs
git diff --cached --name-only
git commit -m "chore: establish pingdou repository identity"
```

Expected staged paths: exactly the three files above.

---

## Task 2: Harden imported print settings and enforce the v0.1 export ceiling

**Files:**

- Modify: `src/print/settings.ts`
- Modify: `src/project.ts`
- Modify: `src/print/validation.ts`
- Modify: `src/PrintSettingsPanel.tsx`
- Modify: `tests/model.test.mjs`
- Create: `tests/project-import.test.mjs`

- [ ] **Step 1: Write failing import-boundary tests**

Create `tests/project-import.test.mjs` using `node:test` and `node:assert/strict`. Cover one malformed project containing string, `NaN`, `Infinity`, negative, and over-limit values. Assert the normalized result is exactly:

```js
assert.deepEqual(normalized.printSettings, {
  cellPitchMm: 5,
  baseThicknessMm: 5,
  beadHeightMm: 0.2,
  dimpleDiameterMm: 4.8,
  dimpleDepthMm: 0,
  baseColorId: normalized.amsColors[0].id,
  mode: "solid",
});
```

Also assert that dimensions `51 × 10`, more than 64 layers, and a file larger than 20 MiB are rejected by `isSafeProjectImport`.

- [ ] **Step 2: Write failing ceiling tests**

In `tests/model.test.mjs`, replace the current 50 × 50 “validates” expectation with:

```js
test("3MF export accepts 32 cells per side and rejects larger grids", () => {
  const accepted = buildPrintableModel(composePrintableGrid(createProject(32, 32)));
  const rejected = buildPrintableModel(composePrintableGrid(createProject(33, 32)));
  assert.doesNotMatch(validatePrintableModel(accepted, false).join("\n"), /32 × 32/);
  assert.match(validatePrintableModel(rejected, false).join("\n"), /32 × 32/);
});
```

Run:

```bash
npm run build
node --test tests/project-import.test.mjs tests/model.test.mjs
```

Expected: failures for unsafe print-setting normalization and missing 32 × 32 error.

- [ ] **Step 3: Put numeric limits in the existing settings module**

In `src/print/settings.ts`, export the bounds already enforced by `PrintSettingsPanel`:

```ts
export const PRINT_SETTING_LIMITS = {
  cellPitchMm: { min: 2, max: 10 },
  baseThicknessMm: { min: 0.4, max: 5 },
  beadHeightMm: { min: 0.2, max: 4 },
  dimpleDiameterMm: { min: 0, max: 5 },
  dimpleDepthMm: { min: 0, max: 2 },
} as const;
```

Reuse these constants in `PrintSettingsPanel.tsx`; do not introduce a second validation class or schema dependency.

- [ ] **Step 4: Normalize every imported print-setting at the shared boundary**

Add a local `finiteInRange` helper in `src/project.ts` and normalize settings before constructing the project:

```ts
function finiteInRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
```

After normalizing pitch and bead height, clamp dependent values to `pitch - 0.2` and `beadHeight - 0.2`. Accept only `solid` or valid `layered` mode. Resolve `baseColorId` only to a normalized material ID. Keep malformed cell IDs harmless through the existing model validation.

- [ ] **Step 5: Enforce the ceiling once in printable-model validation**

In `src/print/validation.ts`:

```ts
export const MAX_EXPORT_GRID_DIMENSION = 32;

if (
  model.gridSize.width > MAX_EXPORT_GRID_DIMENSION ||
  model.gridSize.height > MAX_EXPORT_GRID_DIMENSION
) {
  errors.push('3MF export supports up to 32 × 32 cells in v0.1.0.');
}
```

Keep editing at `MAX_PROJECT_DIMENSION = 50`; do not reduce canvas size.

- [ ] **Step 6: Run focused and full checks**

```bash
npm run build
node --test tests/project-import.test.mjs tests/model.test.mjs
npm test
```

Expected: all tests pass; the 33 × 32 model returns the ceiling error without allocating a 3MF archive.

- [ ] **Step 7: Commit**

```bash
git add src/print/settings.ts src/project.ts src/print/validation.ts src/PrintSettingsPanel.tsx tests/model.test.mjs tests/project-import.test.mjs
git diff --cached --name-only
git commit -m "fix: harden project import and 3mf limits"
```

---

## Task 3: Add first-use language, replacement, regeneration, and storage safety

**Files:**

- Modify: `src/i18n.tsx`
- Modify: `src/project.ts`
- Modify: `src/App.tsx`
- Modify: `tests/colors.test.mjs`
- Modify: `tests/project-import.test.mjs`

- [ ] **Step 1: Add failing pure-helper tests**

In the existing tests, add assertions for these behaviors:

```js
assert.equal(resolveLanguage("zh", "en-US"), "zh");
assert.equal(resolveLanguage(null, "zh-CN"), "zh");
assert.equal(resolveLanguage(null, "fr-FR"), "en");

assert.equal(hasEditableWork(createProject(10, 10)), false);
const edited = createProject(10, 10);
edited.layers[0].cells[0] = edited.amsColors[0].id;
assert.equal(hasEditableWork(edited), true);

assert.equal(shouldAutoRegenerate(true, false), true);
assert.equal(shouldAutoRegenerate(true, true), false);
```

Update the solid palette-key test so changing `name` or `tdMm` does not change the key, while changing `hex` does.

Run:

```bash
npm run build
node --test tests/colors.test.mjs tests/project-import.test.mjs
```

Expected: new exports are missing and the old palette key fails the name/TD assertion.

- [ ] **Step 2: Add the minimum pure helpers to existing modules**

In `src/i18n.tsx`:

```ts
export function resolveLanguage(saved: string | null, browserLanguage: string): Language {
  if (saved === 'zh' || saved === 'en') return saved;
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
```

In `src/project.ts`, export `hasEditableWork(project)` by checking whether any layer contains a non-null cell. Do not count display preferences as work.

Keep `shouldAutoRegenerate(hasSource, hasManualEdits)` beside the existing generation helpers in `src/App.tsx`; it is one boolean expression, not a state machine.

- [ ] **Step 3: Make storage failure non-fatal**

Change `saveDraft` to return `boolean` and wrap both storage read/write paths in `try/catch`. A failed save returns `false`; a failed read returns `null`. Do not call `localStorage.removeItem` inside the failing catch path.

In `App.tsx`, show the localized notice “Browser storage is unavailable; this session will not be saved.” when `saveDraft(project)` returns `false`. Wrap saving the language choice the same way.

- [ ] **Step 4: Resolve first language without contradicting the document**

Initialize language from saved choice and `navigator.language`:

```ts
const [language, setLanguage] = useState<Language>(() => {
  let saved: string | null = null;
  try { saved = localStorage.getItem(languageKey); } catch { /* session-only */ }
  return resolveLanguage(saved, navigator.language);
});
```

Update `document.documentElement.lang` whenever the choice changes.

- [ ] **Step 5: Track real grid changes instead of every settings change**

Add `manualEditsSinceGeneration` state. In the existing `updateProject`, compare the previous and next layer dimensions/cell values. Mark manual edits only when grid content, layers, width, or height changes. Add an option used only by successful image generation to reset the flag:

```ts
function updateProject(next: BeadProject, source: 'manual' | 'generated' = 'manual') {
  if (source === 'generated') setManualEditsSinceGeneration(false);
  else if (projectGridChanged(project, next)) setManualEditsSinceGeneration(true);
  setProject({ ...next, updatedAt: new Date().toISOString() });
}
```

`projectGridChanged` must be pure and directly tested. Reuse it for undo/redo; print material names, TD, and display toggles must not set the flag.

- [ ] **Step 6: Stop silent re-quantization**

In the auto-generation effect, if a source exists and `manualEditsSinceGeneration` is true, cancel the timer path and show an explicit localized `Regenerate from image` button. That button calls the existing `generateFromImage({ recordHistory: true })`; a successful result uses `updateProject(nextProject, 'generated')`.

Do not add a modal. The existing image card is the action location.

- [ ] **Step 7: Protect destructive replacements with native confirmation**

Create one App-local function:

```ts
function allowProjectReplacement(): boolean {
  return !hasEditableWork(project) || window.confirm(text.replaceProjectConfirm);
}
```

Call it before `startBlank`, user image replacement, bundled sample loading, and JSON import replacement. On cancel, do not mutate state, history, object URLs, or the selected file.

- [ ] **Step 8: Verify and commit only launch hunks**

```bash
npm run build
node --test tests/colors.test.mjs tests/project-import.test.mjs
npm test
git add -p src/App.tsx src/i18n.tsx src/project.ts tests/colors.test.mjs tests/project-import.test.mjs
git diff --cached --name-only
git commit -m "fix: protect first-use edits and browser drafts"
```

Expected: tests pass; only launch-specific hunks are staged from previously dirty files.

---

## Task 4: Generate the deterministic three-color heart artifacts

**Files:**

- Modify: `scripts/generate-sample.mjs`
- Modify: `package.json`
- Create: `samples/pingdou-heart-source.png`
- Create: `samples/pingdou-heart-project.json`
- Create: `samples/pingdou-heart-p2s.3mf`
- Modify: `scripts/post-build.cjs`
- Modify: `tests/three-mf.test.mjs`

- [ ] **Step 1: Create the owned source bitmap using the `imagegen` skill**

Generate a 500 × 500 PNG with this exact content brief:

> Flat centered red heart, thick black outline, warm white background, exactly three flat colors (#ED2B2B, #1C1C1C, #F4F1E8), no text, no shadow, no gradient, no transparency, square composition, crisp geometric edges suitable for reduction to a 10 × 10 pixel grid.

Save as `samples/pingdou-heart-source.png`. Visually inspect it and reject any extra color, text, lighting, or texture.

- [ ] **Step 2: Add failing deterministic-artifact assertions**

Extend `tests/three-mf.test.mjs` to read `samples/pingdou-heart-project.json` and assert:

```js
assert.deepEqual(
  [project.width, project.height, project.printSettings.cellPitchMm],
  [10, 10, 2.5],
);
assert.equal(project.printSettings.mode, "solid");
assert.equal(project.amsColors.length, 3);
assert.equal(project.printSettings.baseColorId, "ams-2-f4f1e8");
assert.deepEqual(buildPrintableModel(composePrintableGrid(project)).sizeMm, {
  x: 25,
  y: 25,
  z: 2,
});
```

Run:

```bash
npm run build
node --test tests/three-mf.test.mjs
```

Expected: failure because the heart project does not yet exist.

- [ ] **Step 3: Reuse the existing solid sample generator**

Append heart generation to `scripts/generate-sample.mjs`; do not create a third generator. Use this exact 10 × 10 matrix:

```js
const heartRows = [
  "..........",
  "..##..##..",
  ".#RR##RR#.",
  "#RRRRRRRR#",
  "#RRRRRRRR#",
  ".#RRRRRR#.",
  "..#RRRR#..",
  "...#RR#...",
  "....##....",
  "..........",
];
```

Map `.` to white, `#` to black, and `R` to red. Keep only the first three AMS colors, set the base to white, use 2.5 mm pitch, and fix both timestamps to `2026-08-27T00:00:00.000Z` before serializing with two-space indentation and a trailing newline.

Validate before writing. Assert the model has 3 materials, 4 physical parts (base plus three bead colors), and size `25 × 25 × 2 mm`.

- [ ] **Step 4: Serve the source through the existing build**

In `scripts/post-build.cjs`, create `generated/dist/samples` and copy only `samples/pingdou-heart-source.png` there. Do not copy large project or 3MF artifacts into the web bundle; README links download those from GitHub.

- [ ] **Step 5: Generate twice and prove determinism**

```bash
npm run sample
shasum -a 256 samples/pingdou-heart-project.json samples/pingdou-heart-p2s.3mf
npm run sample
git diff --exit-code -- samples/pingdou-heart-project.json samples/pingdou-heart-p2s.3mf
npm run build
test -f generated/dist/samples/pingdou-heart-source.png
node --test tests/three-mf.test.mjs
```

Expected: second generation produces no diff; built source exists; tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-sample.mjs scripts/post-build.cjs package.json tests/three-mf.test.mjs samples/pingdou-heart-source.png samples/pingdou-heart-project.json samples/pingdou-heart-p2s.3mf
git diff --cached --name-only
git commit -m "feat: add reproducible three-color heart sample"
```

---

## Task 5: Make the sample and 3MF path dominant in the editor

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/i18n.tsx`
- Modify: `src/styles.css`
- Modify: `src/PrintSettingsPanel.tsx`

- [ ] **Step 1: Add the bundled sample action through the real image pipeline**

In `App.tsx`, fetch `./samples/pingdou-heart-source.png`, convert the blob to a `File`, and pass it to the existing guarded `handleImageFile`:

```ts
async function loadHeartSample() {
  if (!allowProjectReplacement()) return;
  const response = await fetch('./samples/pingdou-heart-source.png');
  if (!response.ok) throw new Error('Could not load the bundled sample.');
  handleImageFile(new File([await response.blob()], 'pingdou-heart-source.png', { type: 'image/png' }), {
    replacementConfirmed: true,
  });
}
```

Set conversion controls to 10 cells, cartoon, keep background, and tolerance 0 before triggering generation. The app must not load `pingdou-heart-project.json` for this action.

- [ ] **Step 2: Emphasize the two first actions**

In the existing image card, add a compact empty-state row with:

```text
Try the sample
Upload your image
```

Show it when there is no pending image and no editable work. Use the existing upload input and button styles plus the smallest new CSS needed. Both buttons must have visible keyboard focus and localized labels.

- [ ] **Step 3: Promote 3MF export**

Add `Export 3MF` as the first primary action in the top export area. Keep PNG, PDF, usage, project JSON, and import actions as secondary controls. Reuse `exportThreeMf`; do not create a second exporter.

When validation fails, set the notice to the first existing validation error and focus or scroll the print error region. On successful download, show this localized handoff:

```text
3MF downloaded. In Bambu Studio: import it, assign white/black/red filaments to the parts, then slice.
```

- [ ] **Step 4: Point visitors to the canonical repository**

Replace the visitor-facing upstream GitHub link with `https://github.com/pgp00/pingdou`. Keep upstream attribution only in `UPSTREAM.md` and README provenance.

- [ ] **Step 5: Build and manually smoke-test locally**

Run:

```bash
npm run dev
```

Expected at the printed local URL:

- English opens for a clean `en-US` browser profile; Chinese opens for `zh-CN`; saved choice wins.
- `Try the sample` produces a 10 × 10 editable result through the image pipeline.
- Editing one cell makes conversion changes wait for `Regenerate from image`.
- Canceling `New` or sample replacement preserves the edit.
- Top-level `Export 3MF` downloads a file for 10 × 10 and shows the Bambu handoff.
- 33 × 32 remains editable but export shows the 32 × 32 error.

- [ ] **Step 6: Run automated checks and commit launch hunks**

```bash
npm test
git add -p src/App.tsx src/i18n.tsx src/styles.css src/PrintSettingsPanel.tsx
git diff --cached --name-only
git commit -m "feat: focus first use on sample and 3mf export"
```

---

## Task 6: Make CI gate Pages on tests, deterministic samples, and ZIP integrity

**Files:**

- Modify: `.github/workflows/deploy.yml`
- Modify: `package.json`

- [ ] **Step 1: Make one verification script authoritative**

Keep `npm run verify` as one build followed by Node tests and both sample generators. Do not make `test` call `verify`, which would create recursion. Exact intent:

```json
{
  "scripts": {
    "test": "npm run build && node --test tests/*.test.mjs",
    "sample": "npm run build && node scripts/generate-sample.mjs && node scripts/generate-layered-sample.mjs",
    "verify": "npm run build && node --test tests/*.test.mjs && node scripts/generate-sample.mjs && node scripts/generate-layered-sample.mjs"
  }
}
```

- [ ] **Step 2: Update the existing workflow instead of adding another**

Add `pull_request` and replace the build command with this verification sequence:

```yaml
      - run: npm ci
      - run: npm run verify
      - run: git diff --exit-code -- samples
      - name: Verify 3MF ZIP integrity
        run: for file in samples/*.3mf; do unzip -t "$file"; done
```

Keep one job producing `generated/dist`. Gate deployment so it runs only on `main` push or manual dispatch, never on pull requests:

```yaml
if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
```

- [ ] **Step 3: Verify locally**

```bash
npm run verify
git diff --exit-code -- samples
for file in samples/*.3mf; do unzip -t "$file"; done
```

Expected: no sample diff; every archive ends with `No errors detected`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml package.json
git diff --cached --name-only
git commit -m "ci: verify samples before pages deployment"
```

---

## Task 7: Replace the repository front door with an English-first proof path

**Files:**

- Modify: `README.md`
- Create: `README.zh-CN.md`
- Create: `CONTRIBUTING.md`
- Modify: `docs/verification/bambu-studio-p2s.md`

- [ ] **Step 1: Preserve the useful Chinese material**

Move the current Chinese README content into `README.zh-CN.md`, then update it to use the same demo URL, heart sample paths, 32 × 32 export ceiling, Node floor, privacy boundary, and Bambu handoff as the English README. Do not retain stale screenshots or unsupported claims.

- [ ] **Step 2: Write the English README above the fold**

Use this exact opening:

```md
# Pingdou

Turn any image into an editable, multicolor 3MF bead relief — locally in your browser.

[Try the live demo](https://pgp00.github.io/pingdou/) · [Download the heart 3MF](samples/pingdou-heart-p2s.3mf) · [简体中文](README.zh-CN.md)

![Pingdou workflow: source image, editable relief, Bambu Studio slice, and printed result](docs/pingdou-workflow-hero.webp)

- **Local by design:** source images and generated files stay in your browser.
- **Editable before export:** fix individual cells after image conversion.
- **Bambu Studio checked:** the grouped 3MF imports, assigns by part, and slices on a P2S.
```

Do not commit this README until the hero path exists; the public branch must never contain a broken image.

- [ ] **Step 3: Complete the README in conversion order**

Add these sections, in order:

1. `60-second quick start`
2. `Bambu Studio in 3 steps`
3. `Heart sample` with source PNG, editable JSON, and 3MF links
4. `Verified on Bambu Lab P2S` with estimated/actual time and the detailed record link
5. `Run locally` using `npm ci`, `npm run dev`, and Node 22.9+
6. `Known limits` including solid/layered behavior, four materials, 32 × 32 export, and manual filament assignment
7. `Privacy` accurately distinguishing no upload from local draft storage
8. `Upstream and license`
9. `Contributing`

After the proof section, include once:

```md
If Pingdou helped you make something, a GitHub star helps other makers find it.
```

- [ ] **Step 4: Add concise contributor guidance**

`CONTRIBUTING.md` must contain only setup, `npm run verify`, how to attach a small input/project/3MF reproduction, and the instruction not to commit generated build output. Do not add governance, a code of conduct, issue-template suite, or security boilerplate in this launch task.

- [ ] **Step 5: Update the Bambu verification record**

Add a dated heart-sample section to `docs/verification/bambu-studio-p2s.md` with:

- source artifact SHA-256;
- Bambu Studio version;
- P2S and 0.4 mm nozzle;
- layer height and filament assignments;
- estimated print time;
- actual wall-clock time;
- pass/fail for import, assignment, slice, and physical print.

Do not enter guessed values. Leave this task uncommitted until Task 8 supplies measured values.

- [ ] **Step 6: Verify links and commands**

```bash
test -f README.zh-CN.md
test -f CONTRIBUTING.md
test -f samples/pingdou-heart-source.png
test -f samples/pingdou-heart-project.json
test -f samples/pingdou-heart-p2s.3mf
test -f docs/pingdou-workflow-hero.webp
npm ci
npm run verify
```

Expected: every local README target exists and verification passes.

- [ ] **Step 7: Commit**

```bash
git add README.md README.zh-CN.md CONTRIBUTING.md docs/verification/bambu-studio-p2s.md
git diff --cached --name-only
git commit -m "docs: make the print proof the project front door"
```

---

## Task 8: Produce the real P2S evidence and workflow hero

**Files:**

- Create: `docs/pingdou-heart-bambu-slice.webp`
- Create: `docs/pingdou-printed-result.jpg`
- Create: `docs/pingdou-workflow-hero.webp`
- Modify: `docs/verification/bambu-studio-p2s.md`

- [ ] **Step 1: Import and slice the tracked release artifact**

Open `samples/pingdou-heart-p2s.3mf` in the current stable Bambu Studio. Assign:

```text
Base + white beads: white
Black outline: black
Red fill: red
Printer: Bambu Lab P2S
Nozzle: 0.4 mm
```

Use a normal small-part PLA profile; do not tune solely to fabricate a sub-30-minute claim. Record Bambu Studio version, layer height, estimated time, and material estimate.

- [ ] **Step 2: Enforce the estimate gate**

If estimated print time is 30:00 or longer, stop public-release work. Adjust only documented print settings or the sample geometry within the approved 10 × 10, 25 × 25 × 2 mm envelope, regenerate, rerun `npm run verify`, and slice again.

- [ ] **Step 3: Capture the real Bambu screenshot**

Capture a rights-cleared screenshot showing the model, three assigned colors, P2S profile, and estimated time. Crop private account/device data. Use the `imagegen` skill only for resizing/cropping/format conversion; do not synthesize or alter slicer facts. Save as `docs/pingdou-heart-bambu-slice.webp`.

- [ ] **Step 4: Print and photograph**

Print with white, black, and red filament. Measure wall-clock time from print start to completion; it must be below 30:00.

Photograph the actual object on a neutral background with a simple scale reference, oblique side lighting, and an approximately 45-degree view. The image must visibly show the white base, black outline, red fill, raised beads, and dimples. Save the un-fabricated photograph as `docs/pingdou-printed-result.jpg`.

- [ ] **Step 5: Build the proof composite using the `imagegen` skill**

Combine, without inventing content:

1. `samples/pingdou-heart-source.png`;
2. a screenshot of the deployed editor showing the 10 × 10 result and 3D preview;
3. `docs/pingdou-heart-bambu-slice.webp`;
4. `docs/pingdou-printed-result.jpg`.

Create a clean left-to-right workflow labeled only `Image`, `Edit`, `Slice`, `Print`. Preserve legibility and factual UI. Save as `docs/pingdou-workflow-hero.webp` at approximately 1600 × 700 and keep it under 1.5 MiB.

- [ ] **Step 6: Record measured proof and verify assets**

Fill the exact values in `docs/verification/bambu-studio-p2s.md`, then run:

```bash
file docs/pingdou-heart-bambu-slice.webp docs/pingdou-printed-result.jpg docs/pingdou-workflow-hero.webp
du -h docs/pingdou-workflow-hero.webp
shasum -a 256 samples/pingdou-heart-p2s.3mf
npm run verify
```

Expected: file types match extensions; hero is under 1.5 MiB; verification passes; estimate and actual time are both below 30 minutes.

- [ ] **Step 7: Commit the evidence**

```bash
git add docs/pingdou-heart-bambu-slice.webp docs/pingdou-printed-result.jpg docs/pingdou-workflow-hero.webp docs/verification/bambu-studio-p2s.md
git diff --cached --name-only
git commit -m "docs: add p2s slice and real print proof"
```

---

## Task 9: Run deployed-demo and release-candidate acceptance

**Files:**

- Create: `docs/release-v0.1.0.md`

- [ ] **Step 1: Create one compact release checklist and launch draft**

`docs/release-v0.1.0.md` contains:

- artifact SHA-256 and measured print facts;
- the 12 manual acceptance items from the approved design;
- known limits;
- Show HN title and first-comment draft;
- one adaptable maker-community draft;
- the 30-day success floor.

Use this factual Show HN title:

```text
Show HN: Pingdou – Turn an image into an editable multicolor 3MF in your browser
```

The post asks for use and feedback, never votes or stars.

- [ ] **Step 2: Verify the clean release candidate**

From a clean checkout at the candidate commit:

```bash
npm ci
npm run verify
git diff --exit-code -- samples
for file in samples/*.3mf; do unzip -t "$file"; done
git status --short
```

Expected: all checks pass, samples do not change, all 3MF archives are valid, working tree is clean.

- [ ] **Step 3: Test the deployed Pages build logged out**

At `https://pgp00.github.io/pingdou/`, in a fresh Chromium profile:

1. confirm no login or upload service is required;
2. load the heart sample;
3. edit one cell;
4. change a conversion control and confirm it cannot silently overwrite the edit;
5. explicitly regenerate;
6. inspect the 3D preview;
7. export the 3MF;
8. import that newly exported file into Bambu Studio;
9. assign the three colors and slice;
10. confirm README links and sample downloads from logged-out GitHub;
11. verify the GitHub link returns to `pgp00/pingdou`;
12. confirm there are no analytics/network uploads of the source image.

Mark each item with the date and browser/Bambu versions. Any failure blocks release.

- [ ] **Step 4: Re-read current community rules with `agent-reach`**

Immediately before posting, verify current Show HN, relevant Bambu/3D-printing community, and Product Hunt rules. Update only platform-specific wording and scheduling; never add a vote request.

- [ ] **Step 5: Commit**

```bash
git add docs/release-v0.1.0.md
git diff --cached --name-only
git commit -m "docs: add v0.1.0 release acceptance"
```

---

## Task 10: Publish the independent repository and v0.1.0

**Files:**

- No source changes expected.
- External state: GitHub repository, Pages settings, repository metadata, release, and community posts.

- [ ] **Step 1: Restore GitHub authentication**

Current local `gh` credentials for `pgp00` are invalid. Reauthenticate interactively:

```bash
gh auth login
gh auth status
```

Expected: `gh auth status` reports a valid `pgp00` session. Do not paste tokens into shell history or project files.

- [ ] **Step 2: Create or connect the independent public repository**

If `pgp00/pingdou` does not exist:

```bash
gh repo create pgp00/pingdou --public --source=. --remote=origin --description "Turn any image into an editable, multicolor 3MF bead relief — locally in your browser."
```

If it already exists, add its HTTPS URL as `origin`. Confirm before pushing:

```bash
git remote -v
git log --oneline -5
git status --short
```

Expected: origin is exactly `https://github.com/pgp00/pingdou.git`; release branch is clean.

- [ ] **Step 3: Push and set focused discovery metadata**

```bash
git push -u origin main
gh repo edit pgp00/pingdou --homepage "https://pgp00.github.io/pingdou/" --description "Turn any image into an editable, multicolor 3MF bead relief — locally in your browser." --add-topic 3d-printing --add-topic 3mf --add-topic bambu-studio --add-topic perler-beads --add-topic image-to-3d --add-topic browser-app
```

Expected: repository is public, README renders, topics are present, and Pages workflow starts.

- [ ] **Step 4: Wait for CI and verify Pages**

```bash
gh run list --workflow deploy.yml --limit 1
gh run watch
```

Expected: verification and Pages deployment succeed. Repeat Task 9 Step 3 against the deployed URL after the run completes.

- [ ] **Step 5: Tag and publish only after every gate passes**

```bash
git tag -a v0.1.0 -m "Pingdou v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 samples/pingdou-heart-p2s.3mf samples/pingdou-heart-project.json samples/pingdou-heart-source.png --title "Pingdou v0.1.0" --notes-file docs/release-v0.1.0.md
```

Expected: release assets download logged out and their SHA-256 matches the verified local files.

- [ ] **Step 6: Launch on the approved schedule**

- 2026-09-01 morning America/New_York: submit Show HN and remain available for two hours.
- Following days: at most one targeted maker community per day, rewriting for its rules and audience.
- Second week: consider Product Hunt only if account and launch assets qualify.

Track only GitHub traffic/referrers, stars, release downloads, substantive feedback, reported Bambu imports, and reported physical prints. Do not add application telemetry.

---

## Final verification checklist

- [ ] `npm ci` succeeds using only canonical npm registry URLs.
- [ ] `npm run verify` passes from a clean checkout.
- [ ] Sample regeneration leaves no tracked diff.
- [ ] Every checked-in 3MF passes ZIP integrity.
- [ ] Imported print settings cannot bypass supported types or ranges.
- [ ] 32 × 32 exports; 33 × 32 remains editable but cannot export.
- [ ] A saved language choice wins; otherwise `zh*` is Chinese and all other browsers are English.
- [ ] Heart sample uses the real image-conversion pipeline.
- [ ] A manual grid edit cannot be silently replaced.
- [ ] Destructive replacement cancellation preserves all state.
- [ ] `Export 3MF` is the primary top action and uses the shared validator/exporter.
- [ ] Canonical GitHub and Pages links are consistent.
- [ ] README has no broken or placeholder visual.
- [ ] Real P2S slice and physical print evidence exist and are maintainer-owned.
- [ ] Estimated and actual print time are both below 30 minutes.
- [ ] Deployed Pages passes the logged-out end-to-end checklist.
- [ ] Public launch waits for green CI and every manual release gate.
