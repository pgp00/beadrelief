# Bambu Auto-Color 3MF Design

Date: 2026-08-28  
Status: Approved in conversation; awaiting written-spec review

## Objective

Every 3MF exported by Pingdou must open in Bambu Studio with the intended project-filament colors already visible and each printable part assigned to the matching project filament. The user may still need to confirm how those project filaments map to the physical AMS currently attached to the printer.

This replaces the earlier launch decision to emit only a standard grouped 3MF and require manual part assignment.

## User-visible behavior

Pingdou keeps one primary `Export 3MF` action and produces one file.

For a new project, the active material slots are:

1. white, used as the default base;
2. black;
3. red.

The fourth slot is absent by default. The existing `Add color` action enables it, and all four slots remain editable. Imported existing projects preserve their material count, order, names, colors, and base selection rather than being rewritten to the new defaults.

After export, the success message states that Bambu project-filament colors are included and reminds the user to confirm the physical AMS mapping before printing.

## File design

The export remains a standards-readable 3MF package. Its core model continues to contain:

- the current watertight printable meshes;
- one assembly with independently assignable parts;
- standard 3MF base-material names and display colors;
- the current dimensions, names, and build item.

The same archive additionally contains the minimum Bambu metadata required for automatic color display and project-filament assignment:

- a project-filament list derived from the current Pingdou AMS colors;
- a one-based filament/extruder assignment for each printable part;
- the Bambu package relationships and content declarations required to load that metadata.

The exporter derives the mapping by matching each part's `materialId` to the corresponding entry in the project's ordered AMS-color list. It does not infer assignments from part names or color proximity.

The Bambu metadata must not contain:

- an AMS serial number or a claim about what is physically loaded;
- account, cloud, network, or printer credentials;
- generated G-code;
- a complete copied P2S process profile;
- thumbnails or other presentation assets unless Bambu Studio proves they are required for loading the color mapping.

If Bambu requires a filament type for the project-filament entry, Pingdou uses a generic PLA type without claiming a filament brand. Printer, process, and physical AMS choices remain under the user's control.

## Compatibility

Bambu Studio reads the additional metadata and should immediately show the configured colors and part assignments. Other 3MF-capable slicers may ignore the Bambu-specific metadata and continue reading the standards-compliant core model.

The feature targets the current stable Bambu Studio release used for acceptance. Because the metadata format is not a stable public Pingdou API, the repository keeps direct structural fixtures and a documented GUI acceptance check. A future Bambu metadata incompatibility must not corrupt or remove the standard model.

Pingdou continues to support both solid and layered print modes:

- solid parts map to the material slot named by each part's `materialId`;
- layered physical bands map to their ordered bottom-to-top material slots;
- preview-only estimated layered colors are never exported as physical filaments.

## Validation and failure handling

Existing geometry and export validation runs before archive creation. Bambu metadata generation additionally rejects export when:

- a printable part references a material not present in the project slot list;
- the project contains fewer than one or more than four active materials;
- a required color is malformed;
- generation of a required metadata entry fails.

The exporter must not silently fall back to a standard file that opens all-white in Bambu Studio. On failure, the current project stays intact and the existing export error surface identifies the material or mapping that must be corrected.

## Implementation boundary

Use the existing ZIP writer, printable model, validation flow, and AMS editor. Add only the minimum metadata generation needed by the accepted file shape. No new dependency, second exporter, profile-management system, printer connection, or Bambu upload workflow is introduced.

The Bambu Studio-saved heart file currently present in the isolated worktree is user evidence, not a template to overwrite or commit blindly. It may be inspected to identify the minimum accepted keys. Tests must create their own temporary/generated artifacts.

## Automated verification

The smallest durable tests must prove that:

- a new project has exactly white, black, and red slots in that order, with white as the base;
- adding a fourth slot continues to work;
- imported existing projects preserve their slot order and colors;
- the archive retains the standard 3MF model and materials;
- three- and four-slot archives contain the expected Bambu project-filament colors;
- every exported physical part has the correct one-based filament assignment;
- solid and layered mappings exclude preview-only geometry;
- an unknown part material rejects export;
- repeated generation is byte-deterministic;
- existing geometry, 32 × 32 export ceiling, sample regeneration, and ZIP-integrity checks remain green.

## Bambu Studio acceptance

From a clean browser project and a fresh Bambu Studio session:

1. Export the default white, black, and red project.
2. Open the file without manually editing its parts.
3. Confirm the model immediately displays the intended white base, black outline, and red fill.
4. Confirm the project-filament list contains white, black, and red.
5. Add and use a fourth Pingdou color, export again, and confirm it is recognized.
6. Switch to the Bambu Lab P2S and 0.4 mm nozzle and confirm the color assignments remain intact.
7. Confirm that Bambu Studio still allows the user to map project filaments to the printer's actual AMS slots.
8. Repeat the import check with one layered-mode fixture and confirm each physical band uses its ordered project filament.

No physical print is needed to prove metadata loading, but the release heart still requires the separate slice-time and real-print evidence defined by the open-source launch specification.

## Non-goals

- Automatically detecting what is physically loaded in an AMS.
- Storing a printer or AMS identity.
- Uploading or sending a print job.
- Bundling full P2S process presets or Bambu-generated G-code.
- Adding separate standard and Bambu download buttons.
- Supporting arbitrary slicer-private color metadata in this change.
