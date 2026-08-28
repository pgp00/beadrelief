# Pingdou v0.1.0 release gate

This is the release checklist and copy deck. Unchecked items block the public announcement; they are not implied claims.

## Release artifacts

| Artifact | SHA-256 |
| --- | --- |
| `samples/pingdou-heart-source.png` | `e6f8cc9cde3bebb2bce12cf8ef96dfa403c9d658702a6d4a2a9c04eeffa41d44` |
| `samples/pingdou-heart-project.json` | `4d67c502a30d4a02614e791dd7777f10dcfdd2b4c97fd4cdde27ea71c4e9d3d5` |
| `samples/pingdou-heart-p2s.3mf` | `8565e9aa27a34a895a2f5c58fe9dbe09471585f3ad320fe53092900effab7ce8` |

- Geometry: 10 × 10 cells, 25 × 25 × 2 mm
- Colors: white, black, and red
- Target: Bambu Studio `02.08.02.61`, Bambu Lab P2S, 0.4 mm nozzle
- Estimated print time: pending; must be below 30 minutes
- Actual wall-clock print time: pending; must be below 30 minutes
- Material estimate and process settings: pending GUI slice

## Manual release acceptance

Run this against the deployed GitHub Pages build in a fresh current-Chromium profile. Record the date and exact browser/Bambu versions when completing it.

- [ ] Open the deployed page without installing or signing in.
- [ ] Load the bundled heart sample.
- [ ] Edit one cell and confirm conversion controls cannot silently overwrite it; then regenerate explicitly.
- [ ] Inspect the 3D preview.
- [ ] Export the heart 3MF.
- [ ] Import that exported file into Bambu Studio.
- [ ] Confirm the included white, black, and red project-filament colors and part assignments; map them to the physical AMS slots as needed.
- [ ] Slice with the documented P2S profile.
- [ ] Confirm the estimated print time is below 30 minutes.
- [ ] Print it and confirm actual wall-clock time is below 30 minutes.
- [ ] Capture the final slice screenshot and physical photograph.
- [ ] Verify every README and sample link from a logged-out browser session.

Local Chrome acceptance already covers the sample flow, edit/regeneration guard, replacement cancellation, valid export, oversized-export error focus, and canonical GitHub link. It does not substitute for the deployed, logged-out, Bambu Studio, or physical-print checks above.

## Known limits

- 3MF export is limited to 32 × 32 cells; larger projects remain editable.
- Projects use at most four materials.
- Solid mode exports grouped same-height color parts. Layered mode uses one global bottom-to-top filament order, not Bambu Studio Mixed Filament metadata.
- Project-filament colors and part assignments are included; physical AMS slot mapping must be confirmed in Bambu Studio before printing.
- Source cropping, printer upload, Bambu-private project metadata, accounts, cloud storage, and analytics are not included.

## Show HN draft

Title:

> Show HN: Pingdou – Turn an image into an editable multicolor 3MF in your browser

First comment:

> I built Pingdou because I wanted a fast way to turn one image into a printable multicolor bead relief without uploading the image or depending on proprietary slicer metadata. Conversion, cell editing, the 3D preview, and grouped 3MF export all run locally in the browser.
>
> The repository includes the source PNG, editable project, and deterministic 3MF for a small three-color heart. The 3MF includes project-filament colors and part assignments for Bambu Studio while keeping its color regions as assignable parts. For v0.1.0, export is intentionally capped at 32 × 32 cells; confirm the physical AMS slot mapping before printing, and note that layered mode uses a global color stack rather than mixed-filament metadata.
>
> I would value feedback from anyone who tries the demo or imports the sample: where did the image-to-slice path become unclear, and what failed on your printer or slicer?

## Maker-community draft

> I made Pingdou, a local-browser tool that converts an image into an editable multicolor bead relief and exports a grouped 3MF. I am sharing a small white/black/red heart with its source PNG and editable project so the result is reproducible. The export includes project-filament colors and part assignments; confirm the physical AMS slot mapping before printing. 3MF export is capped at 32 × 32 cells. If this fits this community's rules, I would appreciate reports from people who try the sample—especially import, assignment, slice, or print failures.

Re-read the current rules for Show HN and each target maker community immediately before posting. Adapt the wording and schedule; do not request votes or coordinated stars.

## First 30 days

- 100 genuine GitHub stars
- 10 substantive external feedback items
- Three external users reporting successful Bambu Studio import
- At least one external user completing a physical print

If the floor is missed, inspect GitHub referrers, README clarity, demo failures, and public feedback before adding features.
