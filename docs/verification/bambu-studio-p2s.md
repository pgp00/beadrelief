# Bambu Studio compatibility

## Current reproducible samples

| File | SHA-256 |
| --- | --- |
| `samples/beadrelief-heart-source.png` | `e6f8cc9cde3bebb2bce12cf8ef96dfa403c9d658702a6d4a2a9c04eeffa41d44` |
| `samples/beadrelief-heart-project.json` | `99da9549547a3c9185a94dcb25ac862b3fab21018ef4a876862c56e9f16a550c` |
| `samples/beadrelief-heart-p2s.3mf` | `5ec26b0f44a4003a473c7ccbcaa6672dbd4c6472dac1b5529b06c76fc6289c2f` |
| `samples/beadrelief-p2s-sample.3mf` | `53985bf0e6d965a5c5bb78241a1ba0f8805396ec1e0bb09aea8ba1de834bb50d` |
| `samples/beadrelief-p2s-layered-sample.3mf` | `a45b4f85cf40768e434119b93a4bda763a30df447403fd94ca6045ed9cadbcfa` |

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

The complete automated gate was rerun on 2026-09-14 in the optimization worktree with `npm run check`, `npm run verify`, a no-diff sample check, and checksum verification. It passed with 149 tests, including the real Chrome browser suite, with no skips; generated sample bytes remained unchanged.

On 2026-10-06, the samples were regenerated to correct Application metadata from `BeadRelief-0.1.0` to `BeadRelief-0.2.0`. An entry-by-entry ZIP comparison against the previous samples confirmed that this string is the only change: geometry, materials, assignments and recipes are unchanged. The table above and `SHA256SUMS` identify the new bytes; the September gate refers to the previous hashes.

The 2026-10-06 software fixes passed `npm run check` and `npm run verify`: 154 tests passed with no failures, cancellations or skips, including real Chrome. Regeneration matched the updated checksums, and all three sample ZIPs passed CRC validation. An independent review also exercised profile preservation through preview/3MF, synchronous PNG encoding failure cleanup, and 48 layer/explosion combinations. The first full run found a browser-test timing assumption after a synthetic resize click; waiting for the actual React size-field update fixed that test, and the complete gate then passed.

Run the same checks locally with:

```bash
npm ci
npm run verify
```

## Current manual status

The exact current sample bytes have not yet been recorded through a fresh Bambu Studio GUI import and slice, and no physical print has been completed. No print-time or physical-result claim is made. Before printing, review the imported project-filament mapping, map it to the physical AMS slots, and inspect the slice preview.

A GUI verification attempt on 2026-10-06 confirmed that Bambu Studio `02.07.01.62` is installed, but local UI automation could not obtain its window: the application was absent from the available-app list, its display-name lookup failed, and a bundle-ID lookup did not return before it was interrupted. No current sample was imported or sliced. GUI slicing therefore remains unaccepted; physical printing was excluded from this software-fix request.

Layered mode is experimental until a current Bambu Studio import confirms that the embedded `layer_height` and `initial_layer_print_height` values of `0.08` are honored. Each complete material band above the base should slice into four 0.08 mm layers; a deliberately truncated final band may contain fewer layers. Count the base separately (the current layered sample has a 1.2 mm base, or 15 layers, followed by 16 color layers).

## Historical P2S slice observation

An earlier layered fixture was imported and sliced with Bambu Studio `02.07.01.62`, a Bambu Lab P2S, and a `0.4 mm` nozzle. It imported as four assignable parts without a geometry-repair warning and sliced successfully with a `23m23s` total estimate, three layer-boundary tool changes, and `4.04 g` total material including purge and prime.

Those bytes were superseded at commit `e6a318c`. This observation supports the geometry and slicer workflow only; it is not acceptance evidence for the current sample files or a completed physical print.
