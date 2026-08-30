# Contributing

Thanks for helping improve BeadRelief. Small, focused pull requests are the easiest to review and merge.

## Before you start

- Search existing issues before opening a new one.
- For a behavior change, open or reference an issue that explains the user problem.
- Keep refactors separate from feature changes unless the refactor is required for the fix.

Good first contributions include documentation fixes, focused accessibility improvements, an isolated pure-function test, or a small reproducible browser bug. Check the [`good first issue`](https://github.com/pgp00/beadrelief/labels/good%20first%20issue) label for scoped tasks. Avoid broad rewrites, new state frameworks, or generated build output.

## Repository map

| Path | Purpose |
|---|---|
| `src/App.tsx` | Workspace orchestration, import/export, and panels |
| `src/WorkspaceCanvas.tsx` | Canvas interaction and drawing |
| `src/appLogic.ts` | Pure workspace state transitions |
| `src/canvasOperations.ts` | Pure grid selection and edit operations |
| `src/print/` | Printable model, validation, recipes, ZIP, and 3MF export |
| `src/i18n.tsx` | Compile-checked Chinese and English UI copy |
| `tests/` | Node and Chromium regression tests |
| `scripts/` | Build, sample, checksum, and local-server scripts |

See [`docs/architecture.md`](docs/architecture.md) for the data flow and change guide.

## Local setup

Use Node.js 22.9 or newer, then install the locked dependencies:

```bash
npm ci
```

Start the local app with:

```bash
npm run dev
```

## Verify

Before opening a pull request, run:

```bash
npm run check
npm run verify
```

This builds the production site, runs the full test suite, and regenerates committed samples. If sample files change, explain why in the pull request.

## Releases

Maintainers update `CHANGELOG.md` and `package.json`, run `npm run release:prepare`, then push a `v*` tag. The release workflow re-verifies the project and attaches the checked samples with `SHA256SUMS`.

## Pull requests

- Describe the user-visible problem and the smallest solution.
- Add one regression check for non-trivial behavior.
- Update both languages when changing UI copy.
- Keep the app usable with keyboard controls and at a 980 px desktop viewport.
- Do not commit `dist/`, `generated/`, local plans, logs, screenshots, or editor files.

## Bug reproductions

For a bug or export issue, attach the smallest useful reproduction: the input image, the project JSON, and the exported 3MF when applicable. Remove private or unrelated data first.
