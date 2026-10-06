# Changelog

Notable user-facing changes are recorded here. BeadRelief follows semantic versioning once a version is tagged.

## Unreleased

### Fixed

- Image regeneration preserves the printer, nozzle, material profile and measured color calibration.
- PNG layers export sequentially and release their Canvas buffers on success or failure; download errors reject the export.
- Estimated layered colors follow single-layer inspection and exploded parts, including their clipping planes.
- Adjustment sessions no longer overwrite subsequent edits or history; cleanup keeps its weighted-RGB distance scale.
- Project JSON imports and exports share the same 50 MiB limit; oversized 3MF grids are rejected before modeling and unsupported layered borders are blocked.

### Changed

- Large drafts use IndexedDB with legacy migration and show bilingual saving, saved and persistent failure states.
- Image conversions reuse bounded color matches within each conversion.
- 3MF Application metadata matches version 0.2.0; regenerated samples and checksums reflect this metadata-only change.

## 0.2.0 - 2026-08-30

### Added

- In-app quick start, canvas shortcut reference, FAQ, and browser support guidance.
- Common physical pegboard size presets for bead-pattern projects.
- Typed workspace and canvas-operation modules with focused regression coverage.
- Accessibility smoke checks at the minimum supported viewport.
- Tag-driven GitHub releases with verified sample assets and checksums.

### Changed

- Large pattern editing and preview work is deferred or simplified to avoid browser long tasks.
- Chinese and English translation keys now share a compile-checked shape.
- Remaining component-level language branches now use the shared translation dictionary.

## 0.1.0 - 2026-08-29

- Added local image-to-bead conversion with editable layers and MARD palettes.
- Added PNG, PDF, XLSX, JSON, and grouped 3MF exports.
- Added solid and experimental layered print workflows with material calibration.
- Added deterministic samples and production Chromium regression coverage.
