# Pingdou Filament-Painting Mode Design

Date: 2026-07-31
Status: Approved

## Objective

Add an optional HueForge-style filament-painting mode to Pingdou. A Bambu Lab P2S with an AMS should be able to use two to four PLA filaments, one filament per Z layer, to create more perceived colors than physical filaments while preserving the round, medium-ironed perler-bead appearance.

The existing solid-color mode remains unchanged. The new mode must provide editable predicted colors, a 3D preview, and a grouped standard 3MF that Bambu Studio can assign to AMS slots and slice without model repair.

## Confirmed assumptions

The user approved adding the mode and the following unanswered choices use the recommended defaults:

- prioritize visible round bead outlines over photographic color accuracy;
- allow bead tops to differ in height by up to about 1.2 mm;
- include CMYW and RYBW starter templates while allowing arbitrary PLA colors;
- expose Transmission Distance (TD) as a calibration value because real filament varies by brand, color, batch, and print settings.

These defaults are reversible settings, not separate product variants.

## Research constraints

HueForge filament painting uses one filament per layer. It predicts how underlying colors remain visible through upper layers using each filament's RGB color and TD. HueForge defines TD as the solid thickness that blocks at least about 95% of transmitted light. The exact HueForge prediction implementation is not public, so Pingdou will implement and label a simple TD-based approximation rather than claim HueForge-compatible color accuracy.

Bambu Studio 2.8.1 Beta can decompose colors for Bambu PLA Basic CMYW and RYBW combinations. Its separate Color Mixing feature alternates two or three filaments within mixed layers. Bambu's release notes still warn that Color Mixing is experimental, is unsuitable for top/bottom surface color layering, and causes frequent swaps and high waste on single-nozzle printers. Pingdou therefore will not emit or depend on Bambu Mixed Filament metadata.

References:

- <https://hueforge.wiki/index.php/FAQ>
- <https://hueforge.wiki/index.php/Common_Terms>
- <https://shop.thehueforge.com/blogs/news/what-is-hueforge>
- <https://github.com/bambulab/BambuStudio/releases>

## Chosen approach

Use one global bottom-to-top filament sequence and a different stop height for each bead cell.

The first filament prints the rectangular base and the minimum bead relief. Each later filament occupies one contiguous Z band. A cell can stop after any printable layer in the current band; cells that continue receive all preceding bands below them. Four filaments therefore require no more than three global filament changes, independent of image dimensions.

With four filaments and four printable layers in each upper filament band, the candidate palette contains thirteen colors:

- one exposed first-filament color;
- four thicknesses of filament 2 over filament 1;
- four thicknesses of filament 3 over the completed lower bands;
- four thicknesses of filament 4 over the completed lower bands.

This is a one-dimensional color path through the four filaments, not arbitrary CMYK mixing. The selected order strongly affects the useful gamut. The UI therefore describes the AMS list as both physical material slots and bottom-to-top stack order.

### Alternatives rejected

**Bambu Mixed Filament** can create more colors while keeping equal heights, but it is a poor match for a P2S single nozzle and a top-facing flat artwork because it can switch filament repeatedly within a layer.

**Spatial dithering with four solid colors** needs no optical model, but it creates visible speckles, weakens the individual bead image, and can force many same-layer material changes.

**A separate service or HueForge integration** would add upload, deployment, licensing, and file-exchange complexity. The required deterministic stack can be generated locally with the existing browser pipeline.

## Product behavior

The print panel gains a mode switch:

- `Solid colors`: current behavior and current project files continue to work.
- `Layered colors`: generate and edit the predicted stack palette.

Layered mode supports two to four filaments. For each filament the user can edit:

- name;
- display color;
- TD in millimetres.

The first filament's TD is stored with the same filament record shape but does not affect the current preview because the base stack is treated as opaque; the UI labels that field accordingly.

The existing list order is the stack order: AMS 1 is the bottom and AMS 4 is the top. No drag-and-drop ordering UI is added; users edit the four rows or apply a template. Bambu Studio can map the exported materials to whichever physical AMS slots are loaded.

Two templates seed names, display colors, order, and explicitly approximate TD values:

- Bambu PLA Basic CMYW;
- Bambu PLA Basic RYBW.

Templates are starting points, not calibrated claims. A short warning says to print a TD test and replace the estimates when color accuracy matters.

The stack layer height is fixed at 0.08 mm in the first version. Each filament gets four layers, so the first filament prints 0.32 mm of bead relief before later colors begin. With four colors, bead relief ranges from 0.32 to 1.28 mm. Layered-mode base thickness must also be a multiple of 0.08 mm; the default 1.20 mm is valid. Keeping every Z boundary on the same layer grid prevents material changes from falling between slicer layers and removes a setting that would otherwise make calibrated TD values incomparable.

In layered mode the centre dimple depth equals one stack layer. This keeps the depression visible without cutting through a thin top-color section. Solid mode keeps the existing independent dimple-depth setting.

When the user selects layered mode while a source image is still loaded, Pingdou regenerates from that source using the stack palette. Without a source image, existing cells are mapped to the nearest stack color and the UI advises re-importing the image for best detail. Mode changes use the existing undo history; Pingdou does not maintain duplicate solid and layered canvases.

## Optical model

For an upper filament with RGB color `C`, TD value `d`, and printed thickness `t`, approximate its remaining transmission as:

```text
T = 0.05 ^ (t / d)
result = C * (1 - T) + underColor * T
```

At `t = d`, five percent of the lower color remains, matching the public 95%-blocking definition of TD. Computation occurs in linear RGB; the resulting display color is converted back to sRGB. Candidate-to-image matching uses the project's existing OKLab distance.

This intentionally simple Beer-Lambert-style model ignores wavelength-specific absorption, surface scattering, extrusion width, temperature, and filament batch variation. The TD control is the correction mechanism. The preview says `Estimated color`, not `Exact color`.

Candidate colors are calculated deterministically from bottom to top. The first filament is treated as opaque because the base plus first bead section is thicker than a normal color layer. Each later candidate adds one more layer of the current filament to the preceding completed stack.

## Image conversion and editing

The existing image sampler, background removal, cleanup, and OKLab matching remain authoritative. In layered mode they receive the generated thirteen-color stack palette instead of the two-to-four physical filament colors.

Cell values continue to be strings so all existing drawing, fill, move, copy, layers, undo, and project persistence code can be reused. A layered cell ID encodes its stop level and predicted display color:

```text
stack-<level>-<rrggbb>
```

The palette resolver recognizes both current `ams-*` IDs and new `stack-*` IDs. Geometry reads the stop level, while 2D rendering reads the embedded predicted color. If filament color, TD, or order changes, layered IDs are regenerated from their stop levels so the canvas and print model stay synchronized.

The layered palette displays the candidate colors in ascending stop-height order. Painting with a swatch changes a cell's stop height. No free-form RGB color picker is added because a color that is not on the generated stack path is not printable.

The existing usage panel must not report the thirteen perceived colors as thirteen purchased materials. In layered mode it shows the two-to-four physical filament rows and estimates their printed bead-layer counts from the selected stop levels. Exact grams are out of scope because slicer line width, walls, infill, and purge settings determine them.

## Data model

Extend existing types rather than creating a parallel project format:

```ts
type PrintMode = 'solid' | 'layered';

type AmsColor = {
  id: string;
  name: string;
  hex: string;
  tdMm: number;
};

type PrintSettings = {
  // existing fields remain
  mode: PrintMode;
};
```

Four upper-band layers are a product constant for the first version, not a saved setting. It yields more than four colors while keeping maximum relief and UI small. Add a setting only if real test prints show four layers are inadequate.

Project normalization supplies solid mode and safe TD defaults for old JSON files. Solid-mode IDs and export behavior remain backward compatible.

The printable-grid type becomes a small discriminated union so model generation cannot confuse a physical material ID with a layered stop level. The final `PrintableModel` still exposes physical materials and material-assigned mesh parts to the existing 3MF exporter.

## Printable geometry

The current cell pitch, rectangular base, fused circular footprint, bevel, and shallow centre depression remain. Layered geometry changes only Z segmentation and per-cell top height.

The generated model has one material part per physical filament:

1. part 1 contains the base plus the minimum first-filament bead relief for every cell;
2. each later part contains its horizontal band only for cells whose stop level reaches that band;
3. a cell that stops inside a band receives a closed top at its selected layer;
4. every part is independently watertight and adjacent bands meet at exactly one shared Z plane without volumetric overlap.

At any non-boundary Z layer, only one material exists anywhere in the object. This is the invariant that limits the P2S to at most three global AMS changes.

The top bevel and dimple are translated to each cell's selected top Z. The minimum relief keeps even first-color cells visibly bead-shaped rather than flat with the base. Model height is the base thickness plus the highest selected stop level, not always the theoretical maximum.

## Preview

The 2D editor draws each cell with its predicted stack color.

The 3D preview continues to use the exported watertight band geometry. It adds non-exported top-surface overlays grouped by predicted candidate color, offset by a tiny rendering epsilon to avoid z-fighting. The exposed side walls retain the real filament-band colors, while the top faces show the estimated optical result.

The preview reports:

- physical X, Y, and actual maximum Z;
- number of physical filaments;
- number of perceived candidate colors used;
- layer height and expected global swap count.

No second preview engine or new rendering dependency is added.

## 3MF and Bambu Studio workflow

The existing standard 3MF container and base-material mapping remain. Layered parts use stable names such as:

```text
Base_and_Beads_AMS_1_Blue
Stack_AMS_2_Red
Stack_AMS_3_Yellow
Stack_AMS_4_White
```

The archive contains no G-code, printer credentials, Bambu private presets, or Mixed Filament definitions. Bambu Studio imports one assembled object with two to four material-assigned parts.

The usage instructions tell the user to:

1. import the 3MF and select the P2S 0.4 mm profile;
2. map each named part to its corresponding AMS filament;
3. use a 0.16 mm initial layer and 0.08 mm remaining layers;
4. slice with 100% infill for predictable optical density;
5. confirm that the preview changes material only at the global band boundaries;
6. print a small sample before relying on calibrated color.

The exporter does not generate a prime tower setting. Bambu Studio remains responsible for purge volumes and the tower.

## Validation and migration

Layered export rejects:

- fewer than two or more than four physical filaments;
- invalid display colors;
- non-finite or non-positive TD values;
- a base thickness that is not an integer multiple of 0.08 mm;
- malformed or out-of-range stack cell IDs;
- any Z interval containing more than one physical material;
- non-closed meshes, invalid triangle indices, or dimensions beyond existing P2S limits.

Existing solid projects normalize to `mode: 'solid'`. Missing TD values receive documented estimates and do not alter solid output. Removing a filament in layered mode remaps cells whose stop levels referenced that band to the nearest remaining candidate and records the change in undo history.

## Verification

Framework-free Node tests cover the minimum non-trivial logic:

- TD blending is deterministic and leaves five percent of the lower color at one TD;
- four filaments generate thirteen ordered candidates and more than four distinct predicted colors for the fixture;
- image conversion can use the generated palette and emits only valid stack IDs;
- changing TD regenerates display colors without changing stop levels;
- layered geometry uses no more than four physical materials and has at most one material in each Z interval;
- minimum and maximum bead heights, top bevels, and dimples match settings;
- every material part is closed and all indices are valid;
- the grouped 3MF round-trips with the expected part names, material IDs, bounds, and assembly structure;
- old project JSON normalizes to solid mode without changing its cell grid.

Manual browser acceptance uses one colorful illustration and one photograph. It verifies import, generated blend palette, painting a different stop height, save/reload, predicted 2D and 3D colors, and 3MF download.

Official Bambu Studio acceptance uses the installed stable P2S profile:

1. import the fixed layered sample without a repair warning;
2. confirm one assembled object and no more than four assignable material parts;
3. slice with a 0.16 mm initial layer, 0.08 mm remaining layers, and 100% infill;
4. inspect layer coloring to prove at most three global filament changes and no same-layer mixing;
5. confirm model bounds remain inside 250 × 250 mm and the slice has no empty-layer or out-of-bed error.

A physical TD test print is recommended but not required to prove software completion because final color depends on the user's actual filament and calibration.

## Non-goals

- reproducing HueForge's proprietary prediction algorithm or file format;
- Bambu Mixed Filament or Decompose Color integration;
- arbitrary full-gamut CMYK mixing;
- cloud filament libraries or accounts;
- automatic printer upload;
- automatic TD measurement;
- purge-volume, print-time, or gram-accurate cost prediction;
- more than four AMS filaments in one layered stack.

## Acceptance criteria

The feature is complete only when:

- solid mode remains backward compatible and its existing verification still passes;
- layered mode produces more than four perceived candidate colors from four physical filaments;
- imported images can be generated and edited using those candidate colors;
- round fused-bead geometry and shallow dimples remain visible with variable cell heights;
- the 2D and 3D previews show estimated layered colors while preserving real dimensions;
- one grouped standard 3MF contains at most four physical material assignments;
- official Bambu Studio slices the fixed sample for P2S with at most three global filament changes and no same-layer mixing;
- all automated checks pass from a clean install/build;
- README instructions explain TD calibration, AMS mapping, 0.16/0.08 mm layer heights, 100% infill, and the limits of predicted color.
