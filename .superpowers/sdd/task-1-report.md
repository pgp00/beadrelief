# Task 1 report

## RED

Command:

```text
npm run build && node --test tests/image-conversion.test.mjs tests/image-adjustments.test.mjs
```

Result: 6 passed, 2 failed. The black/white boundary collapsed to black, and the separated `mard-p9` color merged into `mard-h9`.

## GREEN

Command:

```text
npm run build && node --test tests/image-conversion.test.mjs tests/image-adjustments.test.mjs
```

Result: 9 passed, 0 failed.

## Changed files

- `src/palette.ts`: restored weighted-RGB `colorDistance()` and removed the unused Oklab-distance import.
- `tests/image-conversion.test.mjs`: added black/white cleanup-boundary and limited-color conversion regressions.
- `tests/image-adjustments.test.mjs`: added close/separated layer-color merge coverage.

## Concerns

No known concerns. `nearestPaletteColor()` remains Oklab-based. Full suite was not rerun per task instructions.

## Commit

Implementation commit: `422f3ef` (`fix: restore cleanup color distance scale`)
