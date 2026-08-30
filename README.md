<div align="center">

<img src="samples/beadrelief-heart-source.png" alt="BeadRelief heart" width="96">

# BeadRelief

### Image in. Editable beads out.

Turn any image into an editable bead pattern or a multicolor 3MF relief — entirely in your browser.

[**Try the live demo →**](https://pgp00.github.io/beadrelief/) · [Download the sample 3MF](samples/beadrelief-heart-p2s.3mf) · [简体中文](README.zh-CN.md)

[![Build and verification](https://github.com/pgp00/beadrelief/actions/workflows/deploy.yml/badge.svg)](https://github.com/pgp00/beadrelief/actions/workflows/deploy.yml)

<img src="docs/assets/beadrelief-demo.gif" alt="BeadRelief workflow: load an image, edit the bead pattern, and preview the 3D relief" width="960">

<sub>Desktop-first · Use a viewport at least 980 px wide for the complete workspace.</sub>

</div>

## Why BeadRelief?

| 🔒 Local by design | 🧩 Printable bead charts | 🖨️ Bambu-ready 3MF |
|:---:|:---:|:---:|
| Images and generated files stay in your browser. | Use the full MARD palette and export PNG/PDF patterns. | Project-filament colors and part assignments are included. |

## Choose an output

The live demo has two explicit workflows that share the same editable canvas:

- **Bead pattern:** use the complete upstream workbench with Basic/Complete MARD palettes, all drawing tools, layers, reference tracing, adjustments, usage counting, 3D bead preview, and PNG/PDF/XLSX/JSON exports. Pattern canvases and image conversion support up to 180 × 180 cells, with the full 291-color palette available.
- **3D print:** convert with up to four AMS colors, inspect the relief, and export a grouped `.3mf`.

Open the [live demo](https://pgp00.github.io/beadrelief/), choose **Bead pattern** or **3D print**, then upload a JPG, PNG, or WebP image.

## From image to print, without guesswork

| 1 · Frame | 2 · Build | 3 · Inspect | 4 · Calibrate |
|:---:|:---:|:---:|:---:|
| Crop, zoom, reposition, and clean the background. | Choose solid or layered color and add a border, detachable backplate, hanging loop, or recessed back text. | Scrub through print layers, isolate a layer, or explode the stack; the same mesh is used for preview and export. | Print the generated swatch, enter measured colors, then save the printer/nozzle/material profile for reuse. |

Every project JSON, layered workbook, and 3MF carries the bottom-to-top print recipe. The 3MF also embeds the selected nozzle and material assignments.

The usage panel can safely merge isolated color speckles in one undoable pass. Layered calibration is tied to the physical filament order, TD, printer, nozzle, and layer height; changing those inputs automatically retires stale measurements.

## Open it in Bambu Studio

1. Import the exported `.3mf`.
2. Select the Bambu Lab P2S and `0.4 mm` nozzle.
3. Review the included project-filament colors and part assignments, map them to the physical AMS slots, then slice and inspect the color preview.

For layered work, open **Material profile → Layered color calibration**, download the calibration 3MF, print it with the same printer/nozzle/filaments, and enter the measured swatch colors before marking the profile as physically verified.

> [!IMPORTANT]
> The checked-in heart file has not yet been physically printed. Always confirm the AMS mapping and slice preview before printing.

## Try the heart sample

Follow the full editable-project path with the same tiny heart:

| Source | Edit | Print |
|:---:|:---:|:---:|
| [PNG](samples/beadrelief-heart-source.png) | [Project JSON](samples/beadrelief-heart-project.json) | [Grouped 3MF](samples/beadrelief-heart-p2s.3mf) |

## Run locally

Requires Node.js 22.9 or newer.

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5174/>.

<details>
<summary><strong>Verification status</strong></summary>

CI regenerates the checked-in samples, tests every 3MF archive, and verifies the embedded project-filament colors and part assignments. Exact hashes and the compatibility record are in [Bambu Studio verification](docs/verification/bambu-studio-p2s.md).

</details>

<details>
<summary><strong>Known limits</strong></summary>

- Solid mode exports one grouped relief. Layered mode is experimental, uses one global bottom-to-top filament order, and is not Bambu Studio Mixed Filament metadata.
- 3D print mode uses up to four materials; those AMS and 3MF limits do not apply to bead-pattern mode.
- 3MF export is limited to 32 × 32 cells.
- Confirm the physical AMS slot mapping in Bambu Studio before printing.

</details>

<details>
<summary><strong>Privacy</strong></summary>

Image processing and generated files stay in the browser; the app does not upload them to a server. The current editable draft may remain in browser local storage until it is replaced or cleared.

</details>

## Upstream and license

BeadRelief is based on the MIT-licensed [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator). See [UPSTREAM.md](UPSTREAM.md) for the imported commit and project-specific changes. This repository is released under the [MIT License](LICENSE).

If BeadRelief helped you make something, a GitHub star helps other makers find it. Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
