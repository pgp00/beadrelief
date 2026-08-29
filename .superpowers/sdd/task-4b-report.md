# Task 4b report — Bambu project-config nozzle metadata

## Status

`BLOCKED` — the production fix and CLI artifact gates pass, but GUI acceptance is pending and is not claimed. Per the narrowed execution scope, no further Bambu Studio session was started, no GUI acceptance document was updated, and no additional metadata guess was added.

## Commits

- `5f7cd3a` — `fix: add Bambu nozzle metadata` (implementation, regression test, and regenerated 3MF samples)
- `docs: record Task 4b verification status` — this report

## TDD evidence

### RED

Command:

```text
npm run build && node --test --test-name-pattern='project settings include exactly one 0.4 mm nozzle entry' tests/three-mf.test.mjs
```

Result: exit 1. The build succeeded; the focused test failed for the intended reason: `actual: undefined`, `expected: ["0.4"]`.

### GREEN

Command:

```text
npm run build && node --test --test-name-pattern='project settings include exactly one 0.4 mm nozzle entry' tests/three-mf.test.mjs
```

Result: exit 0; the focused test passed 1/1. The full `tests/three-mf.test.mjs` file passed 7/7.

## Full verification

Command:

```text
npm run verify
```

Result: exit 0. Build succeeded; Node test runner passed 58/58 tests with 0 failures; both existing sample generators completed:

```text
samples/pingdou-p2s-sample.3mf: 5 parts, 4 materials, 20×20×2 mm
samples/pingdou-heart-p2s.3mf: 4 parts, 3 materials, 25×25×2 mm
samples/pingdou-p2s-layered-sample.3mf: 4 bands, 4 materials, 13 estimated colors, 20×20×2.48 mm
```

## Regenerated sample hashes

| Sample | SHA-256 |
| --- | --- |
| `samples/pingdou-heart-p2s.3mf` | `1524f709715995eb4ef53ad3c8acd7b9d61adee844d983d4b1e046d11aa1dd6b` |
| `samples/pingdou-p2s-sample.3mf` | `e485d8bf98e5c75cac44fe7a06ad691b606143e60b9a1bf317d73d272bb1f1a0` |
| `samples/pingdou-p2s-layered-sample.3mf` | `78daae1f2ec19d7d881762d5deb7c797082fab5916541b6af17c4f2035f228e1` |

The unchanged editable heart project remains SHA-256 `4d67c502a30d4a02614e791dd7777f10dcfdd2b4c97fd4cdde27ea71c4e9d3d5`.

## Metadata and archive checks

- `Metadata/project_settings.config` now contains exactly `"nozzle_diameter": ["0.4"]`.
- Heart project filament colors are White `#F4F1E8`, Black `#1C1C1C`, Red `#ED2B2B` in that order.
- Heart assignments are exact: `Base` and `Beads_White` (outside/background) → extruder 1 (White); `Beads_Black` (outline/border) → extruder 2 (Black); `Beads_Red` (interior/fill) → extruder 3 (Red).
- `unzip -t` reported `No errors detected in compressed data` for all three tracked 3MF archives.
- A second `npm run sample` followed by byte-for-byte `cmp` against the first generated samples reported `deterministic regeneration: byte-identical` for all three archives.

## GUI acceptance

- Target bundle: `/private/tmp/pingdou-bambu-02080261-mount/BambuStudio.app`
- Bambu Studio version: `02.08.02.61` (from `CFBundleShortVersionString`)
- macOS: `26.5.1`
- Heart fixture: `PENDING`; no accepted pass is claimed. Existing pre-fix evidence shows the invalid-config/wrong-green behavior; a prior attempted regenerated-heart screenshot also shows the invalid-config warning.
- Four-color solid fixture: `PENDING`; not opened in the narrowed CLI-only pass. No automatic color/part-assignment claim is made.
- Layered fixture: `PENDING`; not opened in the narrowed CLI-only pass. No automatic physical-band claim is made.
- Physical AMS mapping remains user-controlled; no physical slot mapping was changed.

Screenshot paths:

- `/private/tmp/bambu-task4-fourcolor-import-warning.png` (pre-fix invalid-config warning)
- `/private/tmp/bambu-task4-heart-loaded-clear2.png` (pre-fix wrong-green heart)
- `/private/tmp/bambu-task4b-heart-clean-start.png` (prior regenerated-heart attempt still showing the warning; not a passing acceptance record)

## Files changed

- `src/print/threeMf.ts`
- `tests/three-mf.test.mjs`
- `samples/pingdou-heart-p2s.3mf`
- `samples/pingdou-p2s-sample.3mf`
- `samples/pingdou-p2s-layered-sample.3mf`
- `.superpowers/sdd/task-4b-report.md`

## Concerns

- GUI acceptance remains the release-blocking concern and must be run separately before updating `docs/verification/bambu-studio-p2s.md`.
- Physical slice/print/photo gates remain pending.
- The untracked root `result.json` was present before this pass (mtime `2026-08-28 20:41:39`) and was preserved because it was not produced by this pass.
