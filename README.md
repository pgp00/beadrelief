# Pingdou

Turn any image into an editable, multicolor 3MF bead relief — locally in your browser.

[Try the live demo](https://pgp00.github.io/pingdou/) · [Download the heart 3MF](samples/pingdou-heart-p2s.3mf) · [简体中文](README.zh-CN.md)

<!-- RELEASE_GATE: replace the source preview below with docs/pingdou-workflow-hero.webp after real slice and print assets are supplied. -->
![Pingdou heart source preview](samples/pingdou-heart-source.png)

- **Local by design:** source images and generated files stay in your browser.
- **Editable before export:** fix individual cells after image conversion.
- **Grouped 3MF output:** export parts with Bambu project-filament colors and assignments included.

## 60-second quick start

1. Open the [live demo](https://pgp00.github.io/pingdou/).
2. Upload a JPG, PNG, or WebP image.
3. Choose up to four colors, edit cells as needed, and check the 3D relief preview.
4. Export the grouped 3MF.

## Bambu Studio in 3 steps

1. Import the exported `.3mf` into Bambu Studio.
2. Select the Bambu Lab P2S and `0.4 mm` nozzle, then review the included project-filament colors and part assignments; confirm their mapping to the physical AMS slots before printing.
3. Slice and inspect the color preview before printing.

## Heart sample

Use the same small heart through the full editable-project path:

- [Source PNG](samples/pingdou-heart-source.png)
- [Editable project JSON](samples/pingdou-heart-project.json)
- [Grouped 3MF](samples/pingdou-heart-p2s.3mf)

## P2S release verification

The heart sample is not yet verified in a real Bambu Studio GUI session, and no physical-print photograph is available. Import, project-filament color and part-assignment behavior, physical AMS mapping, layer/profile settings, estimated time, slice result, and wall-clock print time remain pending measured evidence. See the [verification record](docs/verification/bambu-studio-p2s.md) for the artifact hashes and release-gate status.

Target setup: Bambu Studio `v02.08.02.61`, Bambu Lab P2S, `0.4 mm` nozzle.

If Pingdou helped you make something, a GitHub star helps other makers find it.

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

Pingdou is based on the MIT-licensed [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator). See [UPSTREAM.md](UPSTREAM.md) for the imported commit and the project-specific changes. This repository is released under the [MIT License](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, verification, and reproduction attachments.
