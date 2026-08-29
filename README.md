# BeadRelief

Turn any image into an editable, multicolor 3MF bead relief — locally in your browser.

[Try the live demo](https://pgp00.github.io/beadrelief/) · [Download the heart 3MF](samples/beadrelief-heart-p2s.3mf) · [简体中文](README.zh-CN.md)

![BeadRelief heart source preview](samples/beadrelief-heart-source.png)

- **Local by design:** source images and generated files stay in your browser.
- **Editable before export:** fix individual cells after image conversion.
- **Grouped 3MF output:** export parts with Bambu project-filament colors and assignments included.

## 60-second quick start

1. Open the [live demo](https://pgp00.github.io/beadrelief/).
2. Upload a JPG, PNG, or WebP image.
3. Choose up to four colors, edit cells as needed, and check the 3D relief preview.
4. Export the grouped 3MF.

## Bambu Studio in 3 steps

1. Import the exported `.3mf` into Bambu Studio.
2. Select the Bambu Lab P2S and `0.4 mm` nozzle, then review the included project-filament colors and part assignments; confirm their mapping to the physical AMS slots before printing.
3. Slice and inspect the color preview before printing.

## Heart sample

Use the same small heart through the full editable-project path:

- [Source PNG](samples/beadrelief-heart-source.png)
- [Editable project JSON](samples/beadrelief-heart-project.json)
- [Grouped 3MF](samples/beadrelief-heart-p2s.3mf)

## Verification status

CI regenerates the checked-in samples, tests every 3MF archive, and verifies the embedded project-filament colors and part assignments. The current heart file has not yet been physically printed, so confirm the AMS slot mapping and slice preview before printing. Exact hashes and the compatibility record are in [Bambu Studio verification](docs/verification/bambu-studio-p2s.md).

If BeadRelief helped you make something, a GitHub star helps other makers find it.

## Run locally

Requires Node.js 22.9 or newer.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:5174/ in your browser.

## Known limits

- Solid mode exports one grouped relief; layered mode uses one global bottom-to-top filament order and is not Bambu Studio Mixed Filament metadata.
- A project uses up to four materials.
- 3MF export is limited to 32 × 32 cells.
- Exported project-filament colors and part assignments are included; confirm the physical AMS slot mapping in Bambu Studio before printing.

## Privacy

Image processing and generated files stay in the browser; the app does not upload them to a server. The current editable draft may be retained in browser local storage until it is replaced or cleared.

## Upstream and license

BeadRelief is based on the MIT-licensed [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator). See [UPSTREAM.md](UPSTREAM.md) for the imported commit and the project-specific changes. This repository is released under the [MIT License](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, verification, and reproduction attachments.
