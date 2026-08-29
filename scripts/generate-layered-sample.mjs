import { mkdir, writeFile } from "node:fs/promises";
import { createProject, withStackTemplate } from "../generated/dist/src/project.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";
import { validatePrintableModel } from "../generated/dist/src/print/validation.js";

const project = withStackTemplate(createProject(4, 4, "beadrelief-p2s-layered-sample"), "rybw");
const palette = buildStackPalette(project.amsColors);
const levels = [0, 2, 4, 6, 8, 10, 12, 10, 8, 6, 4, 2, 0, 4, 8, 12];
project.layers[0].cells = levels.map((index) => palette[index].id);
const model = buildPrintableModel(composePrintableGrid(project));
const errors = validatePrintableModel(model);
if (errors.length) throw new Error(errors.join("\n"));
if (model.parts.length !== 4 || model.materials.length !== 4 || model.layered?.swapCount !== 3) {
  throw new Error(`Unexpected layered model: ${model.parts.length} parts, ${model.materials.length} materials, ${model.layered?.swapCount} swaps`);
}
if (JSON.stringify(model.sizeMm) !== JSON.stringify({ x: 20, y: 20, z: 2.48 })) {
  throw new Error(`Unexpected layered sample size: ${JSON.stringify(model.sizeMm)}`);
}
await mkdir("samples", { recursive: true });
await writeFile("samples/beadrelief-p2s-layered-sample.3mf", createThreeMf(model));
console.log("samples/beadrelief-p2s-layered-sample.3mf: 4 bands, 4 materials, 13 estimated colors, 20×20×2.48 mm");
