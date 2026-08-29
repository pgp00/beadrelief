# Phase 0–1 Implementation Plan

**Goal:** Make BeadRelief's print contract explicit and prevent invalid, stale, or ambiguous projects from reaching 3MF export.

**Scope:** Phase 0 product-contract decisions and Phase 1 print/input safety from [`PLAN.md`](../PLAN.md). This phase does not include the later performance, accessibility, XLSX, release, or physical-print work.

**Status:** Phase 0 and the Phase 1 code scope are complete. `npm run verify` passes with 75/75 tests. A current Bambu Studio import/slice remains an external acceptance gate, so Layered mode stays experimental.

## Decisions fixed by Phase 0

1. 3MF export supports at most 32×32 cells. Projects up to 50×50 remain editable and keep their 2D exports, but the UI must explain the 3MF limit before export.
2. “Replace project” means replacing the complete project with one newly generated layer. It must not retain unrelated layers from the previous project.
3. “Show active layer only” is a view preference. It must not mutate saved layer visibility or silently change 3MF export scope.
4. Layered 3MF remains experimental until a current Bambu Studio import/slice proves that its embedded 0.08 mm normal and initial layer heights are honored.

## Task 1: Centralize print-setting validation

**Files:**

- `src/print/settings.ts`
- `src/print/validation.ts`
- `src/PrintSettingsPanel.tsx`
- print validation tests

**Work:**

- Reuse `PRINT_SETTING_LIMITS` as the only min/max source.
- Add a small normalization helper for UI/import use and range errors for final export validation.
- Keep relational checks: dimple depth below bead height and dimple diameter below cell pitch.
- Remove version-specific wording from the 32×32 error.

**Checks:**

- Every min/max boundary is accepted.
- Values just outside each boundary are rejected by final validation even when a model is constructed directly.
- UI updates cannot store NaN or an out-of-range number.

## Task 2: Make Layered 0.08 mm settings explicit

**Files:**

- `src/print/threeMf.ts`
- `tests/three-mf.test.mjs`
- `docs/verification/bambu-studio-p2s.md`

**Work:**

- Add `layer_height` and `initial_layer_print_height` with value `0.08` to Layered project settings only.
- Do not override either value for Solid exports.
- Keep the feature marked experimental in user-facing text and verification documentation until the external Bambu test is complete.

**Checks:**

- Layered config contains both values.
- Solid config contains neither value.
- Existing part/material mapping tests continue to pass.

**External follow-up:** A current Bambu Studio reference export and real slice are still required because unit tests cannot prove that Bambu consumes the metadata.

## Task 3: Harden project import as a trust boundary

**Files:**

- `src/project.ts`
- `src/App.tsx`
- `tests/project-import.test.mjs`

**Work:**

- Change normalization to accept `unknown` rather than claiming shallow data is already `BeadProject`.
- Validate top-level records, settings, board settings, AMS arrays, layers, cells, strings, booleans, enums, finite numbers, and ranges with local helpers.
- Reject malformed structures cleanly; normalize valid legacy omissions.
- Require unique, non-empty layer IDs and a valid active layer.
- Ensure failed imports do not replace the current project or its history.

**Checks:**

- Reject `layers: [null]`, non-array AMS data, numeric material names, duplicate IDs, invalid opacity, invalid board dimensions, and zero beads-per-pack without uncaught exceptions.
- Valid current and legacy sample files still import.

## Task 4: Reject unknown colors and invalid serialized geometry

**Files:**

- `src/print/model.ts`
- `src/print/validation.ts`
- `src/print/threeMf.ts`
- model and 3MF tests

**Work:**

- In Solid composition, collect unknown color IDs as input errors instead of silently replacing them with the base material.
- Check every vertex coordinate is finite before topology calculations.
- Reject XML 1.0 illegal control characters in user-controlled names.
- Make numeric serialization reject non-finite values as a final invariant.

**Checks:**

- Unknown Solid IDs block export with a cell error.
- Known legacy palette IDs keep their deterministic mapping.
- NaN and ±Infinity never reach XML.
- XML metacharacters remain escaped and illegal control characters are rejected.

## Task 5: Prevent stale or ambiguous export

**Files:**

- `src/App.tsx`
- `src/PrintSettingsPanel.tsx`
- relevant UI/state tests

**Work:**

- Represent both scheduled and running generation as a single pending state.
- Disable 3MF export while generation is pending and guard the export handler as a second line of defense.
- Generate into a new project after replacement confirmation instead of merging into the previous layer set.
- Make Solo update only `showActiveLayerOnly`; build the printable model from the real project visibility, not the display-only project.

**Checks:**

- A delayed conversion cannot export the previous model.
- Replacing a two-layer project produces one generated layer.
- Toggling Solo does not alter saved `layer.visible` values or 3MF contents.

## Task 6: Make the layer limit explicit

**Files:**

- `src/App.tsx`
- `src/project.ts`
- layer tests

**Work:**

- Disable Add and Duplicate at `MAX_PROJECT_LAYERS`.
- Keep the existing normalization cap as a defensive import boundary, but never silently discard a user-requested new layer.
- Show a concise localized notice when the action is refused.

**Checks:**

- Layer count never exceeds the cap.
- The active layer and existing layers remain unchanged after a refused add/duplicate.

## Execution order

1. Add failing tests for setting bounds, Layered metadata, malformed import, unknown colors, invalid geometry/XML, replacement, Solo, generation gating, and layer limit.
2. Implement Tasks 1–4 at shared trust/export boundaries.
3. Implement Tasks 5–6 in the existing App state flow.
4. Run focused tests after each task.
5. Run `npm run verify` and compare generated sample hashes.
6. Update [`PLAN.md`](../PLAN.md) checkboxes only for work proven by automated tests; leave Bambu slice and physical validation open.

## Definition of done

- Build and all existing/new tests pass.
- Directly constructed invalid models cannot bypass export validation.
- Malformed imported JSON cannot crash normalization or mutate the open project.
- Layered 3MF contains explicit 0.08 mm metadata; Solid does not.
- Pending generation cannot export stale content.
- Replace and Solo follow the Phase 0 contract.
- No new runtime dependency, schema framework, state manager, or unrelated refactor is introduced.
