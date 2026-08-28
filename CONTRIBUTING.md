# Contributing

## Setup

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
npm run verify
```

## Reproductions

For a bug or export issue, attach the smallest useful reproduction: the input image, the project JSON, and the exported 3MF when applicable. Remove private or unrelated data first.

Do not commit generated build output such as `dist/`.
