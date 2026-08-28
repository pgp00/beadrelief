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

const heartRows = [
  "..........",
  "..##..##..",
  ".#RR##RR#.",
  "#RRRRRRRR#",
  "#RRRRRRRR#",
  ".#RRRRRR#.",
  "..#RRRR#..",
  "...#RR#...",
  "....##....",
  "..........",
];
if (heartRows.length !== 10 || heartRows.some((row) => row.length !== 10 || /[^.#R]/.test(row))) {
  throw new Error("Heart sample must be a 10 × 10 matrix containing only ., #, and R.");
}

const heartProject = createProject(10, 10, "pingdou-heart");
heartProject.amsColors = heartProject.amsColors.slice(0, 3);
heartProject.printSettings = {
  ...heartProject.printSettings,
  cellPitchMm: 2.5,
  baseColorId: "ams-2-f4f1e8",
  mode: "solid",
};
const heartCells = heartRows.flatMap((row) => [...row].map((cell) => ({
  ".": "ams-2-f4f1e8",
  "#": "ams-1-1c1c1c",
  R: "ams-3-ed2b2b",
}[cell])));
heartProject.cells = heartCells;
heartProject.layers[0].cells = heartCells;
heartProject.createdAt = "2026-08-27T00:00:00.000Z";
heartProject.updatedAt = "2026-08-27T00:00:00.000Z";

const heartModel = buildPrintableModel(composePrintableGrid(heartProject));
const heartErrors = validatePrintableModel(heartModel);
if (heartErrors.length) throw new Error(heartErrors.join("\n"));
if (heartModel.parts.length !== 4 || heartModel.materials.length !== 3) {
  throw new Error(`Expected 4 parts and 3 materials, got ${heartModel.parts.length} and ${heartModel.materials.length}`);
}
if (JSON.stringify(heartModel.sizeMm) !== JSON.stringify({ x: 25, y: 25, z: 2 })) {
  throw new Error(`Unexpected heart sample size: ${JSON.stringify(heartModel.sizeMm)}`);
}

await writeFile("samples/pingdou-heart-project.json", `${JSON.stringify(heartProject, null, 2)}\n`);
await writeFile("samples/pingdou-heart-p2s.3mf", createThreeMf(heartModel));
console.log("samples/pingdou-heart-p2s.3mf: 4 parts, 3 materials, 25×25×2 mm");
