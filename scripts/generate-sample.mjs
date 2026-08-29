import { mkdir, writeFile } from "node:fs/promises";
import { createProject } from "../generated/dist/src/project.js";
import { DEFAULT_AMS_COLORS } from "../generated/dist/src/print/colors.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";
import { validatePrintableModel } from "../generated/dist/src/print/validation.js";

const project = createProject(4, 4, "beadrelief-p2s-sample");
project.amsColors.push({ ...DEFAULT_AMS_COLORS[3] });
const [white, black, red, blue] = project.amsColors;
project.layers[0].cells = [
  black.id, black.id, white.id, white.id,
  black.id, red.id, red.id, white.id,
  blue.id, red.id, red.id, blue.id,
  blue.id, blue.id, black.id, white.id,
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
await writeFile("samples/beadrelief-p2s-sample.3mf", createThreeMf(model));
console.log("samples/beadrelief-p2s-sample.3mf: 5 parts, 4 materials, 20×20×2 mm");

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

const heartProject = createProject(10, 10, "beadrelief-heart");
const [heartWhite, heartBlack, heartRed] = heartProject.amsColors;
heartProject.printSettings = {
  ...heartProject.printSettings,
  cellPitchMm: 2.5,
  baseColorId: heartProject.amsColors[0].id,
  mode: "solid",
};
const heartCells = heartRows.flatMap((row) => [...row].map((cell) => ({
  ".": heartWhite.id,
  "#": heartBlack.id,
  R: heartRed.id,
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

await writeFile("samples/beadrelief-heart-project.json", `${JSON.stringify(heartProject, null, 2)}\n`);
await writeFile("samples/beadrelief-heart-p2s.3mf", createThreeMf(heartModel));
console.log("samples/beadrelief-heart-p2s.3mf: 4 parts, 3 materials, 25×25×2 mm");
