# Bambu Studio P2S Compatibility Check

- Date: 2026-07-31
- macOS version: 26.5.1 (25F80)
- Bambu Studio version: 02.07.01.62
- Download source: https://github.com/bambulab/BambuStudio/releases/download/v02.07.01.62/Bambu_Studio_mac-v02.07.01.62-20260616174358.dmg
- Download SHA-256: `1e54c25aefc5249d56b63711cf773bed56f14430aafcc34340cd4894aef15896`
- Printer profile: Bambu Lab P2S, 0.4 mm nozzle
- Process profile: 0.20 mm Standard @BBL P2S
- Sample: `samples/pingdou-p2s-sample.3mf`
- Sample SHA-256: `d325903b031b7cb40f34b452e280c94c1ed674b9586bfcba1f41486e80d5aa55`
- Imported structure: one assembly with five independently assignable parts
- 3MF part names: `Base`, `Beads_Black`, `Beads_White`, `Beads_Red`, `Beads_Blue`
- Bambu Studio labels: `Pingdou`, `Pingdou_2`, `Pingdou_3`, `Pingdou_4`, `Pingdou_5`
- Material mapping: Base/Black→1, White→2, Red→3, Blue→4
- Imported dimensions: 20 × 20 × 2 mm
- Imported volume: 720.619 mm³
- Imported triangles: 4620
- Repair warning: none
- Slice result: pass
- Slice height check: layer 6 is a continuous 1.20 mm base; layer 10 reaches 2.00 mm and shows all four bead colors with shallow closed center dimples
- Slice totals: 32m0s, 12 filament changes, 2.61 m / 7.91 g including purge tower and purged filament
- Notes: Bambu Studio displayed its standard third-party 3MF warning and imported one project filament initially. Adding three project filaments and assigning the five parts produced the expected four-color preview. It also replaced the standard child-object names with sequential `Pingdou` labels in its UI; the archive retains the five descriptive names. No account, printer connection, upload, or print command was used.

## Layered fixture — Phase A CLI evidence

- Sample: `samples/pingdou-p2s-layered-sample.3mf`
- Generator: `scripts/generate-layered-sample.mjs`
- CLI verification: `npm run verify` passed: 34 Node tests, then both sample generators completed.
- Archive integrity: `unzip -t` reported `No errors detected` for both fixed samples.
- Solid sample SHA-256 before generator run: `f36d35befb5b86c72e1df72727f4be8b680d67d9a2a4f50ec92290d5cd14da30`
- Solid sample SHA-256 after generator run and current fixture: `d325903b031b7cb40f34b452e280c94c1ed674b9586bfcba1f41486e80d5aa55`.
- Layered sample SHA-256: `74c9e2d9775deea9dee7258081cd70fd05f59920068783fa4a9eab5b3e4fa736`
- XML structure: 4 base materials, 4 assembly components, physical-part bounds `0 × 0 × 0` to `20 × 20 × 2.48 mm`, and no `Estimated_*` geometry.

The generated fixtures are deterministic. The solid fixture changed only because the Task 3 manifold topology correction changed cap-center vertex order and cap-triangle winding; archive entries, size, and model dimensions are unchanged. The layered fixture uses four RYBW physical materials in bottom-to-top AMS order. Its exported model excludes `Estimated_*` preview geometry; those estimated colors are preview-only and are not Bambu Studio Mixed Filament metadata.

## Layered fixture — Bambu Studio acceptance

- Acceptance date: 2026-08-01
- Bambu Studio: `02.07.01.62`; importing the fixture showed only the standard third-party 3MF warning, “load geometry data and color data only”.
- Imported structure: one `Pingdou` assembly with four independently assignable children auto-labelled `Pingdou`, `Pingdou_2`, `Pingdou_3`, and `Pingdou_4`. Archive names remain `Base_and_Beads_Bambu_PLA_Basic_Blue`, `Stack_Bambu_PLA_Basic_Red`, `Stack_Bambu_PLA_Basic_Yellow`, and `Stack_Bambu_PLA_Basic_White`.
- Imported dimensions: `20 × 20 × 2.48 mm`; volume `725.081 mm³`; `7872` triangles. No repair, out-of-bed, or empty-layer warning occurred.
- Printer/process: Bambu Lab P2S, `0.4 mm` nozzle, `0.16 mm` initial layer, `0.08 mm` remaining layer height, and mixed-color sublayer off (`enable_mixed_color_sublayer=0`).
- Object/Part Setting applied `100%` infill and Rectilinear to the assembly/parts. The saved Bambu project records `sparse_infill_density=100` and `sparse_infill_pattern=zig-zag` (Bambu's internal Rectilinear enum), plus `edges_fixed=0`, `degenerate_facets=0`, `facets_removed=0`, `facets_reversed=0`, and `backwards_edges=0` for all four meshes. Its global process remains `15%` Grid; the `100%` Rectilinear values are explicit per-object overrides.
- Saved project mapping: `Pingdou`→extruder 4 Blue, `Pingdou_2`→extruder 3 Red, `Pingdou_3`→extruder 2 Yellow, `Pingdou_4`→extruder 1 White; saved colors are `#FFFFFF`, `#FFFF00`, `#FF0000`, `#0000FF`.
- Official Bambu Studio CLI sliced the GUI-configured temporary project successfully: `return_code=0`, `error_string="Success."`, empty `warning_message`, bbox `20 × 20 × 2.4799998`, `7872` triangles, and `filament_change_times=3`.
- G-code: 30 layers, 30 unique Z heights from `0.16` through `2.48 mm`, max Z `2.48 mm`, model printing `16m21s`, total estimate `23m23s`. Slot weights 1–4 are `0.5429513`, `1.0718923`, `0.9248368`, and `1.5149400 g` (`4.04 g` total including purge/prime; rounded display: `0.54`, `1.07`, `0.92`, `1.51 g`).
- Tool order: initial `T3` Blue, `T2` Red at Z `1.60`, `T1` Yellow at Z `1.92`, and `T0` White at Z `2.24`. Exactly three `CP` toolchanges occur at `CHANGE_LAYER` boundaries; no other printing tool selection exists (`T65535` is shutdown). This proves no same-layer color mixing.
- GUI observations: four child rows showed Blue/Red/Yellow/White badges and `100%`; P2S/nozzle and `20 × 20 × 2.48 mm` were visible. No repository screenshot was retained.
- No printer connection, upload, or print command was used; this was import/configure/slice acceptance only. `samples/pingdou-p2s-layered-bambu-temp.3mf` is controller-created temporary evidence and is intentionally untracked.
