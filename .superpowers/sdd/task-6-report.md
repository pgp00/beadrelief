# Task 6 report

## Artifacts

- Added deterministic layered fixture generator and `samples/pingdou-p2s-layered-sample.3mf`.
- `npm run sample` and `npm run verify` regenerate both fixed samples.
- Added the AMS layered workflow and limitations to `README.md`.
- Regenerated `samples/pingdou-p2s-sample.3mf` to `d325903b031b7cb40f34b452e280c94c1ed674b9586bfcba1f41486e80d5aa55`. The prior `f36d35befb5b86c72e1df72727f4be8b680d67d9a2a4f50ec92290d5cd14da30` bytes predate the Task 3 manifold correction; only cap-center vertex ordering and cap-triangle winding differ, while the archive entries, size, and dimensions remain unchanged.

## CLI checks

- `npm ci --ignore-scripts`
- `npm run verify` twice: 34 Node tests pass and both regenerated sample hashes remain stable.
- `unzip -t` reports no errors for both fixed 3MF archives.
- Layered XML: four base materials, four components, `20 × 20 × 2.48 mm` bounds, and no `Estimated_*` geometry.
- `git diff --check` passes.

## Bambu Studio acceptance

Bambu Studio `02.07.01.62` imported, configured, and sliced the layered fixture for Bambu Lab P2S with a `0.4 mm` nozzle. The documented evidence in [bambu-studio-p2s.md](../verification/bambu-studio-p2s.md) records the four mapped parts, per-object `100%` Rectilinear overrides, clean mesh stats, successful CLI slice, and exactly three layer-boundary tool changes. No printer connection, upload, or print command was used. The controller-created temporary Bambu project remains untracked and is excluded from the commit.
