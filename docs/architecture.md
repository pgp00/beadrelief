# Architecture

BeadRelief is a static, browser-only React application. There is no backend: images, drafts, conversion, previews, and exports stay in the browser.

## Data flow

1. `src/project.ts` creates and normalizes the serializable `BeadProject` model.
2. `src/App.tsx` owns the current project and coordinates imports, panels, history, previews, and exports.
3. `src/appLogic.ts` contains pure workspace decisions that do not need React.
4. `src/WorkspaceCanvas.tsx` translates pointer and keyboard events into grid edits; `src/canvasOperations.ts` and `src/canvasGeometry.ts` contain the testable grid algorithms.
5. `src/print/` builds and validates the same printable mesh used by the 3D preview and 3MF export.

## Change guide

| Change | Start here |
|---|---|
| Project schema or import compatibility | `src/types.ts`, `src/project.ts` |
| Image conversion or color matching | `src/imageToBeads.ts`, `src/palette.ts` |
| Grid selection, fill, move, copy, or mirror | `src/canvasOperations.ts` |
| Shape point generation | `src/canvasGeometry.ts` |
| Canvas input or rendering | `src/WorkspaceCanvas.tsx` |
| Printable geometry or 3MF metadata | `src/print/` |
| User-facing copy | `src/i18n.tsx` |

Keep pure logic outside React components when it can be tested without a browser. Preserve project-import normalization when adding fields, and update both languages for every user-facing string.

## Verification

`npm run check` performs TypeScript static checking. `npm run verify` builds the production site, runs Node and Chromium regression tests, and regenerates deterministic sample files.
