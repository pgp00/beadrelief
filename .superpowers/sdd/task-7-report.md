# Task 7 — reuse image color matches

## Implementation

- Added `cachedMatcher(candidates)` with a private packed-RGB `Map` capped at 65,536 entries.
- Created separate conversion-local matchers for active-palette ranking and selected-candidate matching; the realistic average fallback uses the candidate matcher.
- Enforced byte-range background channels (`0..255`) before packed-key caching while preserving fractional in-range values.
- Added exact repeated-color, gradient, partial-alpha, palette-isolation, maxColors, and realistic average-fallback regression coverage.
- Added an informational 104 × 104 realistic conversion benchmark with repeated and mostly-unique inputs, comparing the cached build with an uncached copy of the same post-Task-1 module.

## TDD evidence

RED: the new out-of-range background regression failed against the pre-change build with `Missing expected exception`.

GREEN: `npm run build && node --test tests/image-conversion.test.mjs tests/performance.test.mjs` passed 15/15 tests.

## Benchmark

On this machine, three measured runs after one warm-up gave these 104 × 104 realistic medians: repeated-color `1075.5ms` uncached → `18.5ms` cached; mostly-unique gradient `1221.2ms` uncached → `72.8ms` cached. The uncached comparator is generated at test time from the built module with only the two cache matchers replaced by direct `nearestPaletteColor` calls; it has no production toggle or dependency. The test reports these via `t.diagnostic()` and intentionally has no timing threshold.

## Scope and concerns

Only `src/imageToBeads.ts`, `tests/image-conversion.test.mjs`, and `tests/performance.test.mjs` were changed for implementation/tests. Existing unrelated README, docs, and node_modules changes were preserved. Browser full-path photo/Worker measurement was not available in this Node-focused task; no Worker conclusion is drawn.
