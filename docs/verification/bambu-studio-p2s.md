# Bambu Studio compatibility

## Current reproducible samples

| File | SHA-256 |
| --- | --- |
| `samples/beadrelief-heart-source.png` | `e6f8cc9cde3bebb2bce12cf8ef96dfa403c9d658702a6d4a2a9c04eeffa41d44` |
| `samples/beadrelief-heart-project.json` | `c3f64b7eee6a695eb8b46539339c47d40a87f1d4fe0ab915fbab8732d30a89fa` |
| `samples/beadrelief-heart-p2s.3mf` | `ba2470a53aadd1b53789fbd9a10d03c328f28eaba653d7c2c19900906bebaa40` |
| `samples/beadrelief-p2s-sample.3mf` | `1596f2ec5d17c8e62b8e9791e8d3afebf66eb7e22369f639ad3009970ac0a833` |
| `samples/beadrelief-p2s-layered-sample.3mf` | `9c34eba2f1bb8fa56a4a9515f521b780c750a95a0b1515ba9bb73970c6489b40` |

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
