import { mkdir, writeFile } from "node:fs/promises";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";
import { validatePrintableModel } from "../generated/dist/src/print/validation.js";

const project = createProject(4, 4, "pingdou-p2s-sample");
project.layers[0].cells = [
  "ams-1-1c1c1c", "ams-1-1c1c1c", "ams-2-f4f1e8", "ams-2-f4f1e8",
  "ams-1-1c1c1c", "ams-3-ed2b2b", "ams-3-ed2b2b", "ams-2-f4f1e8",
  "ams-4-2864dc", "ams-3-ed2b2b", "ams-3-ed2b2b", "ams-4-2864dc",
  "ams-4-2864dc", "ams-4-2864dc", "ams-1-1c1c1c", "ams-2-f4f1e8",
];

const model = buildPrintableModel(composePrintableGrid(project));
const errors = validatePrintableModel(model);
if (errors.length) throw new Error(errors.join("\n"));
if (model.parts.length !== 5 || model.materials.length !== 4) {
  throw new Error(`Expected 5 parts and 4 materials, got ${model.parts.length} and ${model.materials.length}`);
}
if (JSON.stringify(model.sizeMm) !== JSON.stringify({ x: 20, y: 20, z: 2 })) {
  throw new Error(`Unexpected sample size: ${JSON.stringify(model.sizeMm)}`);
}

await mkdir("samples", { recursive: true });
await writeFile("samples/pingdou-p2s-sample.3mf", createThreeMf(model));
console.log("samples/pingdou-p2s-sample.3mf: 5 parts, 4 materials, 20×20×2 mm");
