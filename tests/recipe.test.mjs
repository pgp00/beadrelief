import test from "node:test";
import assert from "node:assert/strict";
import { createProject, withStackTemplate } from "../generated/dist/src/project.js";
import { buildPrintRecipe } from "../generated/dist/src/print/recipe.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";

test("layered recipe is deterministic and follows bottom-to-top AMS order", () => {
  const project = withStackTemplate(createProject(3, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id];
  const recipe = buildPrintRecipe(project);

  assert.equal(recipe.mode, "layered");
  assert.equal(recipe.layerHeightMm, 0.08);
  assert.deepEqual(recipe.slots.map(({ slot }) => slot), [1, 2, 3, 4]);
  assert.deepEqual(recipe.layers.map(({ slot }) => slot), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  assert.deepEqual(recipe.stops.map(({ stopLevel, cells }) => [stopLevel, cells]), [[4, 1], [8, 1], [12, 1]]);
  assert.deepEqual(recipe.layers.at(-1), {
    layer: 12,
    slot: 3,
    material: project.amsColors[2].name,
    zStartMm: 2.08,
    zEndMm: 2.16,
  });
});
