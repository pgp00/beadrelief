# Pingdou Image-to-3MF Design

Date: 2026-07-30
Status: Approved in conversation; awaiting review of this written specification

## Objective

Build a local browser application that converts an uploaded image into a printable, medium-fused perler-bead-style relief. The result uses at most four filament colors, previews and edits the bead grid in the browser, and exports one multi-part 3MF that Bambu Studio can map to AMS slots and slice for a Bambu Lab P2S.

The [P2S build volume](https://jp.store.bambulab.com/en/products/p2s) is 256 × 256 × 256 mm. The application therefore limits generated X/Y dimensions to 250 mm, leaving a 3 mm margin on each side.

## Chosen approach

Start from [Jett-Wu/Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator), preserving its MIT license and copyright notice. Reuse its local image processing, grid editor, project state, and Three.js preview. Add only the print settings, fused-bead geometry, and multi-part 3MF export needed for this project.

The resulting repository remains MIT-licensed and retains the upstream attribution.

[tnbyki/Pixel4STL](https://github.com/tnbyki/Pixel4STL) is a 0BSD reference for physical sizing and color-separated printing. Its Windows UI and STL workflow will not be imported. No code will be copied from projects without a clear repository license.

This route was selected over:

- a new application, which would duplicate an existing editor and image pipeline;
- a Python service, which would add deployment and upload requirements to a task that can run locally.

## Product scope

The first version includes:

- local JPG, PNG, and WebP input;
- crop and image-to-grid conversion;
- one to four user-selected AMS filament colors;
- pencil, eraser/background, fill, undo, and color replacement;
- an orbitable 3D preview matching the exported geometry;
- physical size and print geometry controls;
- a single grouped, multi-part 3MF download;
- automated checks for quantization, geometry, dimensions, material assignment, and 3MF structure;
- a final import and slice check in official Bambu Studio with the P2S profile.

The first version does not include accounts, cloud storage, server processing, AI image generation, filament inventory, automatic printer upload, a silhouette backplate, or multiple ironing-strength presets.

## Architecture

The application remains a static React and TypeScript site. Canvas APIs perform image decoding, sampling, and grid rendering. Pure TypeScript modules handle color matching, printable geometry, and 3MF assembly. Three.js renders the exact print geometry in the preview. All processing and export happen in the browser; user images are never uploaded.

The only new runtime dependency permitted is a small ZIP implementation if the installed Three.js exporter cannot preserve grouped parts and material identities during a round-trip check. Prefer an already-installed implementation first. If a new dependency is required, use `fflate` only for the 3MF ZIP container; geometry and 3MF XML remain project code.

### Main units

`imageToBeads`

- decodes and samples the source image;
- maps samples to the selected AMS palette;
- returns a deterministic grid independent of the preview.

`project`

- stores grid cells, selected palette slots, visible layers, and print settings;
- composes visible layers into one printable cell grid, with the top visible layer winning;
- treats erased or transparent input cells as the chosen base/background slot in printable output.

`printGeometry`

- converts the printable grid into one closed base mesh and one closed bead mesh per used color;
- returns geometry in millimetres plus names and material-slot IDs;
- is shared by the Three.js preview and the exporter so they cannot drift.

`threeMfExporter`

- writes standard 3MF model XML using millimetres;
- writes base-material entries with display colors;
- writes `Base` and `Beads_Color_<n>` mesh objects;
- groups the child meshes as one component/build item;
- packages the required content types and relationships into one `.3mf` download.

`printValidation`

- rejects empty grids, invalid dimensions, invalid geometry, and more than four materials;
- reports errors before a download begins;
- exposes deterministic checks used by the automated verifier.

## Data model

The existing project model remains authoritative for editing. Printing adds these concepts:

```ts
type AmsColor = {
  id: string;
  name: string;
  hex: string;
};

type PrintSettings = {
  cellPitchMm: number;
  baseThicknessMm: number;
  beadHeightMm: number;
  dimpleDiameterMm: number;
  dimpleDepthMm: number;
  baseColorId: string;
};

type PrintablePart = {
  name: string;
  materialId: string;
  vertices: Float32Array;
  triangles: Uint32Array;
};
```

There may be five logical parts (`Base` plus four bead-color parts), but there are never more than four material IDs. `Base` shares the material ID selected by `baseColorId`.

## Image conversion

1. Decode an accepted image in the browser and crop it using the existing crop flow.
2. Cap the processing canvas at 4096 × 4096 pixels while preserving aspect ratio, preventing excessive browser memory use without changing the output grid.
3. Sample the image by bead-cell area rather than by one source pixel.
4. Convert samples and palette entries to OKLab and select the nearest chosen AMS color.
5. Do not dither. Dithering creates isolated color changes that increase AMS swaps and weaken the fused-bead appearance.
6. Default to 32 cells across and preserve image aspect ratio. Permit 8–50 cells on the longest side, subject to the 250 mm physical-size limit.
7. Map transparent/background cells to the selected base color. The first version always produces a rectangular fused panel cropped to the occupied grid bounds.

The user can enter custom filament names and display colors. Display color is an approximation for matching and preview; the application does not claim calibrated physical color accuracy.

## Editing and interface

The single-page workspace has:

- a left panel for image input, four AMS slots, grid size, and physical settings;
- a central 2D grid editor;
- a right panel with the orbitable print preview and final dimensions;
- an export action that remains disabled until validation passes.

The minimum editing tools are pencil, eraser/background, fill, undo, and replace-color. Existing editor features may remain when they do not conflict with printable output, but no new layer or drawing features are added.

Before export, the interface shows width, height, total thickness, cell count, and material count. Errors identify the setting that must change.

## Fused-bead geometry

The output models a medium-ironed finished piece, not loose cylindrical beads and not a pegboard.

Defaults:

| Parameter | Value |
| --- | ---: |
| Cell pitch | 5.0 mm |
| Bead top diameter | 5.0 mm |
| Base thickness | 1.2 mm |
| Bead height above base | 0.8 mm |
| Residual centre dimple diameter | 1.2 mm |
| Residual centre dimple depth | 0.2 mm |
| Radial segments | 24 |

Each bead is a closed, slightly flared disc: its top reaches the cell boundary, producing the touching/fused look, while its lower wall is slightly inset. The top edge is bevelled. A shallow closed dimple remains in the centre; there is no through-hole and no unsupported ceiling. Adjacent bead tops touch, and the common base mechanically joins the complete print.

The base is a closed rectangular plate matching the generated grid. It is behind the bead layer and uses one of the four AMS material IDs. Each color part may contain many disconnected but individually closed bead shells. All dimensions are multiples of 0.2 mm where practical for a standard 0.2 mm layer height.

## 3MF structure

The exported archive contains at least:

```text
[Content_Types].xml
_rels/.rels
3D/3dmodel.model
```

The model uses `unit="millimeter"`. A base-material group defines one entry per used AMS color. Each mesh object has a stable name and object-level material reference. A components object references the base and bead meshes and is the only top-level build item, so slicers can import it as one assembled model with assignable parts.

The exporter does not include printer presets, G-code, network credentials, or Bambu-specific private metadata. Bambu Studio performs printer and filament-profile selection after import.

## Validation and error handling

Input validation rejects unsupported or undecodable files. Print validation rejects:

- no printable cells;
- zero or more than four palette materials;
- non-finite or non-positive dimensions;
- X or Y dimensions above 250 mm;
- dimple depth greater than bead height;
- indices outside the vertex array;
- empty or non-closed generated parts;
- missing 3MF relationships, model entry, build item, or material references.

Generation happens in memory and only triggers a browser download after all checks pass. A failure leaves the editable project unchanged and displays a concise corrective message.

## Verification

A framework-free Node verification script runs after the TypeScript build and uses fixed sample grids to assert:

- quantization uses only the selected one-to-four colors and is deterministic;
- transparent/background cells map to the base color;
- calculated dimensions match grid size and pitch;
- the generated base and bead shells have valid indices and closed edge counts;
- the dimple floor and total thickness match settings;
- the generated 3MF contains required archive entries, one grouped build item, named parts, millimetre units, and no more than four materials;
- a verification helper can reopen the generated ZIP/XML and recover the same part names, counts, bounds, and material IDs.

Manual acceptance uses a small four-color fixture image and one photographic image:

1. Upload, quantize, edit one cell, and inspect the 2D and 3D previews.
2. Export the sample 3MF.
3. Open it in the current official Bambu Studio release.
4. Select the Bambu Lab P2S 0.4 mm profile.
5. Confirm one assembled object, separate named parts, at most four material mappings, correct physical dimensions, and no model-repair warning.
6. Assign AMS slots, slice at 0.2 mm layer height, and confirm the color preview contains the base and every used bead color with no out-of-bed or empty-layer error.

Because Bambu Studio is not currently installed on the development Mac, installing or mounting the official macOS release is a required verification step after implementation and requires user approval for the external download.

## Acceptance criteria

The work is complete only when:

- the local browser application accepts an image and produces an editable grid using at most four chosen colors;
- its preview visibly represents a medium-ironed fused-bead panel with shallow centre dimples;
- it exports one structurally valid, grouped multi-part 3MF;
- automated verification passes from a clean install/build;
- official Bambu Studio imports the file with separate assignable parts under the P2S profile and slices it successfully;
- the repository preserves upstream MIT attribution and documents local development and export usage.
