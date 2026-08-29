# Bambu Studio compatibility

## Current reproducible samples

| File | SHA-256 |
| --- | --- |
| `samples/beadrelief-heart-source.png` | `e6f8cc9cde3bebb2bce12cf8ef96dfa403c9d658702a6d4a2a9c04eeffa41d44` |
| `samples/beadrelief-heart-project.json` | `2b5bfd13e30c2deaeb0abbf6e3a4d618379c83e7dc0a986e84565dd25d97a7b2` |
| `samples/beadrelief-heart-p2s.3mf` | `89533c960cea8a8d4cf14773e28dfa3df4951bf2498f70b834599044c898e468` |
| `samples/beadrelief-p2s-sample.3mf` | `b20bca9d1811a0a83bbe8f248035071f64c4555ec849fa0051bd6ebff81cfc38` |
| `samples/beadrelief-p2s-layered-sample.3mf` | `b71f2c5decb4732ae157383515b8f4b8ce73808417e51e2b53b31f3d92162464` |

The heart is a 10 × 10, approximately 25 × 25 × 2 mm solid-mode sample using white, black, and red. Its grouped 3MF includes Bambu project-filament colors and part assignments; physical AMS slot mapping still needs confirmation before printing.

Automated verification currently covers:

- deterministic regeneration of all three 3MF samples;
- ZIP integrity and required 3MF metadata entries;
- matching component-object and Bambu part-metadata IDs;
- the expected white, black, and red heart assignments;
- printable-model geometry and export validation.
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
