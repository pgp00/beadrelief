# Bambu Studio compatibility

## Current reproducible samples

| File | SHA-256 |
| --- | --- |
| `samples/beadrelief-heart-source.png` | `e6f8cc9cde3bebb2bce12cf8ef96dfa403c9d658702a6d4a2a9c04eeffa41d44` |
| `samples/beadrelief-heart-project.json` | `99da9549547a3c9185a94dcb25ac862b3fab21018ef4a876862c56e9f16a550c` |
| `samples/beadrelief-heart-p2s.3mf` | `dc7a03a1cc8fab393415ad8bb3e067441a54cd9cf760db4b47dbc77f1fba77f4` |
| `samples/beadrelief-p2s-sample.3mf` | `d67a38b73d60fbf0762c32a413ddb4bbb68f09e8b83f31233568f8b2063e0f59` |
| `samples/beadrelief-p2s-layered-sample.3mf` | `4f0cd30102f26922140ef2c80b6be3b11522f2e0526da80fa4a27b741159b335` |

The heart is a 10 × 10, approximately 25 × 25 × 2 mm solid-mode sample using white, black, and red. Its grouped 3MF includes Bambu project-filament colors and part assignments; physical AMS slot mapping still needs confirmation before printing.

Automated verification currently covers:

- deterministic regeneration of all three 3MF samples;
- ZIP integrity and required 3MF metadata entries;
- matching component-object and Bambu part-metadata IDs;
- the expected white, black, and red heart assignments;
- printable-model geometry and export validation;
- embedded print recipes, nozzle metadata, and material-profile boundaries;
- closed topology for borders, hanging loops, detached backplates, and recessed text;
- calibration swatch coverage and measured-color preview overrides.

Run the same checks locally with:

```bash
npm ci
npm run verify
```

## Current manual status

The exact current heart bytes have not yet been recorded through a fresh Bambu Studio GUI import, slice, and physical print. No print-time or physical-result claim is made. Before printing, review the imported project-filament mapping, map it to the physical AMS slots, and inspect the slice preview.

Layered mode is experimental until a current Bambu Studio import confirms that the embedded `layer_height` and `initial_layer_print_height` values of `0.08` are honored and each material band slices into exactly four layers.

## Historical P2S slice observation

An earlier layered fixture was imported and sliced with Bambu Studio `02.07.01.62`, a Bambu Lab P2S, and a `0.4 mm` nozzle. It imported as four assignable parts without a geometry-repair warning and sliced successfully with a `23m23s` total estimate, three layer-boundary tool changes, and `4.04 g` total material including purge and prime.

Those bytes were superseded at commit `e6a318c`. This observation supports the geometry and slicer workflow only; it is not acceptance evidence for the current sample files or a completed physical print.
