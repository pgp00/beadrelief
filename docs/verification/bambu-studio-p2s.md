# Bambu Studio compatibility

## Current reproducible samples

| File | SHA-256 |
| --- | --- |
| `samples/pingdou-heart-source.png` | `e6f8cc9cde3bebb2bce12cf8ef96dfa403c9d658702a6d4a2a9c04eeffa41d44` |
| `samples/pingdou-heart-project.json` | `4d67c502a30d4a02614e791dd7777f10dcfdd2b4c97fd4cdde27ea71c4e9d3d5` |
| `samples/pingdou-heart-p2s.3mf` | `7c6e12e8a64d179ab672b7e04ef37bb6e2e5696def4b7b82d5fa62630a8f28e5` |
| `samples/pingdou-p2s-sample.3mf` | `82d8a1bd82955a52988d2b331686ac9f07d9dfd1ba3d6d1b19c961c7919df1c5` |
| `samples/pingdou-p2s-layered-sample.3mf` | `72baff9bcef680bd1fdd33c62fe868cf99e4fc3b9c45580cb1213e8b0fa80848` |

The heart is a 10 × 10, approximately 25 × 25 × 2 mm solid-mode sample using white, black, and red. Its grouped 3MF includes Bambu project-filament colors and part assignments; physical AMS slot mapping still needs confirmation before printing.

Automated verification currently covers:

- deterministic regeneration of all three 3MF samples;
- ZIP integrity and required 3MF metadata entries;
- matching component-object and Bambu part-metadata IDs;
- the expected white, black, and red heart assignments;
- printable-model geometry and export validation.

Run the same checks locally with:

```bash
npm ci
npm run verify
```

## Current manual status

The exact current heart bytes have not yet been recorded through a fresh Bambu Studio GUI import, slice, and physical print. No print-time or physical-result claim is made. Before printing, review the imported project-filament mapping, map it to the physical AMS slots, and inspect the slice preview.

## Historical P2S slice observation

An earlier layered fixture was imported and sliced with Bambu Studio `02.07.01.62`, a Bambu Lab P2S, and a `0.4 mm` nozzle. It imported as four assignable parts without a geometry-repair warning and sliced successfully with a `23m23s` total estimate, three layer-boundary tool changes, and `4.04 g` total material including purge and prime.

Those bytes were superseded at commit `e6a318c`. This observation supports the geometry and slicer workflow only; it is not acceptance evidence for the current sample files or a completed physical print.
