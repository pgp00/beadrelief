# BeadRelief software fixes

User-approved scope: implement the improvements from the project review, excluding physical printing. The previous full baseline passed 149 tests; current samples still lack manual slicer and physical acceptance.

Use the existing React owner, native Canvas/IndexedDB APIs and Node tests. Add no dependencies, change no project schema, preserve the 180 × 180 pattern / 64-layer / 32 × 32 3MF limits, and keep all UI text bilingual. Preserve existing untracked handoffs. Work in the current checkout; independent agents own disjoint files.

## 1. Preserve material profiles during generation

- [x] Extend the existing generation regression in `tests/colors.test.mjs` with a custom nozzle and calibrated profile, including mutation isolation.
- [x] In `src/appLogic.ts`, copy the profile and its measurements alongside the retained materials:

```ts
materialProfile: {
  ...project.materialProfile,
  measuredColors: project.materialProfile.measuredColors.map((color) => ({ ...color })),
},
```

- [x] Build centrally and run `node --test tests/colors.test.mjs tests/profile.test.mjs`.

## 2. Bound PNG export memory

- [x] Replace `Promise.all` in `src/exporters.ts` with a sequential `for...of`, await `toBlob`, download outside its callback, and set `canvas.width = canvas.height = 0` in `finally`.
- [x] Use an asynchronous Canvas stub in `tests/exporters.test.mjs` to assert one live canvas, release before the next layer, and early stop/release on encoding or download failure.
- [x] Run `node --test tests/exporters.test.mjs` after the central build.

## 3. Keep estimated overlays aligned with the print preview

- [x] In `src/ThreePreview.tsx`, reuse the existing clipping planes for overlays and hide surfaces from other layers during single-layer inspection.
- [x] Compute each overlay's exploded offset from its stop level and the existing four-layer material bands, matching physical-part offsets.
- [x] Extend `tests/preview.test.mjs` for cumulative, single, exploded and combined controls, including partial final bands.
- [x] Run `node --test tests/preview.test.mjs` after the central build.

## 4. Show durable draft status

- [x] Replace the failure-only state in `src/App.tsx` with the last current-project save result. Derive pending status by snapshot identity, retain failure until a later current save succeeds, and preserve restore ordering and stale-completion guards.
- [x] Add Chinese/English saving and saved messages in `src/i18n.tsx` and render them in the existing live status region.
- [x] Extend `tests/browser-golden.test.mjs` to cover pending, success, failure, stale completions and both languages.

## 5. Update release and verification records

- [x] Correct 3MF Application metadata to the package version and assert that relationship in `tests/three-mf.test.mjs`.
- [x] Regenerate samples, inspect that only Application metadata changed, then regenerate checksums and document the new hashes.
- [x] Populate `CHANGELOG.md` Unreleased, update the backup FAQ in both READMEs, and mark previous handoffs as historical without deleting their contents.
- [x] Correct layered manual acceptance wording to allow a partial final material band.
- [x] Attempt Bambu Studio GUI slicing of the regenerated samples if supported local UI tools are available. Record actual observations only; physical printing remains incomplete.

## Final gate

- [x] Run `npm run check` and `npm run verify` with real Chrome and no skipped browser tests.
- [x] Confirm deterministic sample regeneration, `node scripts/generate-checksums.mjs --check`, and `git diff --check`.
- [x] Independently review the combined diff and resolve material findings.

Final automated result (2026-10-06): 154 passed, 0 failed, 0 skipped. Three sample ZIPs passed CRC validation. The resize browser regression now waits for both size fields to synchronize through the existing React effect, preserving the delayed-preview/export assertions.

Manual slicer status: attempted, not accepted. Bambu Studio 02.07.01.62 is installed, but UI automation could not obtain its window; no samples were imported or sliced. Physical printing was excluded. The verification document retains both incomplete manual gates.
