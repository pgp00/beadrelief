# Draft safety and paged PDF verification

Verified locally on 2026-11-13 (America/New_York), starting from `621f71d`, using Node 26.0.0 and Chrome 157.0.8103.51 on macOS.

## Behavior and implementation

- Native Web Locks hold a single draft writer for the page session. Short-lived programmatic saves acquire the same lock when no writer is provided; concurrent clients cannot bypass the lock. Writer release drains active database transactions and prohibits new operations.
- Restore respects early edits and React StrictMode cancellation. Only current-project transaction success clears the dirty warning. Busy/unavailable/failed sessions expose JSON backup and explicit reload actions.
- PDF whole-image output remains available. A4/Letter documents are built page-by-page, with 29-cell tiles, original coordinates, a thumbnail overview, paged per-document usage and neighboring PDF page numbers.
- Each layer is encoded and downloaded sequentially. Canvas buffers are released on rendering, encoding, byte conversion and download failures. Blob URLs and anchor elements are cleaned up even when clicks fail.
- A document is limited to 64 MiB of encoded JPEG page images. This is not a bound on total browser process memory. Long custom color codes use stable bracketed legend indexes instead of shrinking below seven points.

## Automated coverage

The original baseline passed 155 tests, with no failures or skips. The updated full gate passed 173 tests, with no failures or skips, including real Chrome. It covers the existing editor, IndexedDB faults/migration/ordering, delayed StrictMode restoration, current-save status, project imports, all export formats and 3MF geometry; new tests cover lock ownership/release, exact grid coverage and crop coordinates, multi-page PDF xref offsets, PDF resource failure paths and same-context browser tabs.

The final gate additionally tests backup and an unsaved reload warning in the secondary tab, and the paper-layout selector. `npm run check`, `npm run verify`, deterministic sample comparison, checksum verification and `git diff --check` are required before pushing. Sample 3MF bytes and checksums remain unchanged.

## Visual QA

Generated actual PDFs in `generated/qa/draft-pdf/`: A4/Letter 29-cell and 58-cell examples, plus a Chinese A4 180×180 chart using all 291 MARD colors. The 180-cell document contains 55 pages: overview, five usage pages and 49 details. Detail coverage is disjoint and complete; the final tile is 6×6.

Poppler-rendered overview, usage, first detail and final detail pages were inspected for Chinese glyphs, readable codes, page references, spacing and coordinate bands. These are raster reading charts, not physical 1:1 templates. No printer or slicer changes are part of this update.

## Measurement method and limitations

`PDF_MEMORY_BENCH=1 node --test tests/pdf-browser.test.mjs` exercises deterministic 180×180, 291-color inputs at 1, 8 and 64 layers. Each group has one warm-up followed by three measurements. The test records elapsed time, individual PDF sizes, maximum active export canvases, maximum canvas pixels and remaining active buffers. Input layers differ by a deterministic color rotation.

The raw RGBA estimate is width × height × 4 bytes. A4 at 200 ppi is 1654×2339 pixels: 15,474,824 bytes (14.76 MiB) for one raw pixel buffer. This excludes JPEG buffers, PDF assembly copies, React/project data and browser overhead. Browser RSS and true instantaneous native-memory peaks were not captured; no total-memory-constant claim is made. Each complex single-layer PDF is approximately 46.4 MiB. A full 64-layer export therefore produces about 3 GiB of files even though layers are generated sequentially.

The original pre-change renderer did not receive an equivalent process-memory benchmark, so there is no numerical before/after peak-memory reduction claim. The structural improvement is directly tested: one active Canvas and zero active Canvas buffers when export finishes or fails.

## Compatibility boundaries

- Old open app tabs do not participate in Web Locks; close or refresh them after updating.
- Web Locks absence disables autosave but preserves readable drafts and manual backups. Browser leave warnings require user activation and cannot protect every forced-exit case.
- Existing layer selection semantics are retained, including hidden nonempty layers when there are multiple nonempty layers. A single nonempty layer uses the composed project. PDF usage counts refer only to the cells in that document.
- Browser download initiation does not prove a file reached disk. Later failure cannot revoke files downloaded earlier; the interface reports possible partial output.
- QA files are intentionally generated artifacts rather than repository assets. Reproduce them with the browser test above.

## Repeated paged-export measurements

Warm-ups excluded; three runs per group.

| Layers | Median seconds | Maximum seconds | Largest PDF MiB | Active canvases / remaining |
| --- | ---: | ---: | ---: | --- |
| 1 | 1.15 | 1.26 | 46.49 | 1 / 0 |
| 8 | 9.61 | 9.82 | 46.44 | 1 / 0 |
| 64 | 78.98 | 79.95 | 46.46 | 1 / 0 |
