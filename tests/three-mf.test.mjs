import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProject, withStackTemplate } from "../generated/dist/src/project.js";
import { DEFAULT_AMS_COLORS } from "../generated/dist/src/print/colors.js";
import { composePrintableGrid, buildPrintableModel, meshBounds } from "../generated/dist/src/print/model.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";
import { readZipEntries } from "./helpers/zip.mjs";

function parseModelSettings(settings) {
  return [...settings.matchAll(/(<part\b[^>]*>)([\s\S]*?)<\/part>/g)].map(([, opening, body]) => {
    const id = opening.match(/\bid="(\d+)"/)?.[1];
    const name = body.match(/<metadata key="name" value="([^"]*)"\s*\/>/)?.[1];
    const extruder = body.match(/<metadata key="extruder" value="(\d+)"\s*\/>/)?.[1];
    assert.ok(id && name !== undefined && extruder);
    return {
      id: Number(id),
      name: decodeXml(name),
      extruder: Number(extruder),
    };
  });
}

function parseComponentObjectIds(modelXml) {
  return [...modelXml.matchAll(/<component\b[^>]*\bobjectid="(\d+)"[^>]*\/>/g)]
    .map(([, id]) => Number(id));
}

function decodeXml(value) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  })[entity]);
}

function expectedPartAssignments(model, componentObjectIds) {
  assert.equal(componentObjectIds.length, model.parts.length);
  return model.parts.map((part, index) => {
    const materialIndex = model.materials.findIndex((material) => material.id === part.materialId);
    assert.notEqual(materialIndex, -1);
    return { id: componentObjectIds[index], name: part.name, extruder: materialIndex + 1 };
  });
}

test("3MF contains one assembly, named parts, and four or fewer base materials", () => {
  const project = createProject(2, 2);
  project.amsColors = DEFAULT_AMS_COLORS.map((material) => ({ ...material }));
  project.layers[0].cells = project.amsColors.map((material) => material.id);
  const model = buildPrintableModel(composePrintableGrid(project));
  const archive = createThreeMf(model);
  assert.deepEqual(archive, createThreeMf(model));
  const entries = readZipEntries(archive);
  const decoder = new TextDecoder();
  assert.deepEqual([...entries.keys()], [
    "[Content_Types].xml",
    "_rels/.rels",
    "3D/3dmodel.model",
    "Metadata/project_settings.config",
    "Metadata/model_settings.config",
    "Metadata/beadrelief_recipe.config",
  ]);
  const recipe = JSON.parse(decoder.decode(entries.get("Metadata/beadrelief_recipe.config")));
  assert.equal(recipe.mode, "solid");
  assert.deepEqual(recipe.slots.map(({ name, hex }) => [name, hex]), model.materials.map(({ name, hex }) => [name, hex]));
  const projectSettings = JSON.parse(decoder.decode(entries.get("Metadata/project_settings.config")));
  assert.deepEqual(projectSettings.filament_colour, model.materials.map((material) => material.hex.toUpperCase()));
  assert.deepEqual(projectSettings.filament_type, model.materials.map(() => "PLA"));
  const modelSettings = decoder.decode(entries.get("Metadata/model_settings.config"));
  const relationships = decoder.decode(entries.get("_rels/.rels"));
  assert.match(relationships, /Target="\/3D\/3dmodel\.model"/);
  const xml = decoder.decode(entries.get("3D/3dmodel.model"));
  assert.deepEqual(parseModelSettings(modelSettings), expectedPartAssignments(model, parseComponentObjectIds(xml)));
  assert.match(xml, /unit="millimeter"/);
  assert.match(xml, /name="Base"/);
  assert.match(xml, /name="Beads_Black"/);
  assert.equal((xml.match(/<base /g) ?? []).length, 4);
  assert.equal((xml.match(/<component objectid=/g) ?? []).length, 5);
  assert.equal((xml.match(/<item objectid=/g) ?? []).length, 1);
  assert.equal((xml.match(/pid="1" pindex="[0-3]"/g) ?? []).length, 5);
  const recovered = [...xml.matchAll(
    /<object id="\d+" name="([^"]+)" type="model" pid="1" pindex="(\d+)">\s*<mesh>([\s\S]*?)<\/mesh>\s*<\/object>/g,
  )].map((match) => {
    const vertices = [...match[3].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)]
      .map((vertex) => vertex.slice(1).map(Number));
    return {
      name: match[1],
      materialId: model.materials[Number(match[2])].id,
      bounds: {
        min: [0, 1, 2].map((axis) => Math.min(...vertices.map((vertex) => vertex[axis]))),
        max: [0, 1, 2].map((axis) => Math.max(...vertices.map((vertex) => vertex[axis]))),
      },
    };
  });
  assert.deepEqual(recovered, model.parts.map((part) => ({
    name: part.name,
    materialId: part.materialId,
    bounds: meshBounds(part),
  })));
  assert.equal(new TextDecoder().decode(archive.slice(0, 4)), "PK\u0003\u0004");
  assert.equal(new TextDecoder().decode(archive.slice(-22, -18)), "PK\u0005\u0006");
});

test("model settings part IDs match assembly component object IDs", () => {
  const project = createProject(1, 1);
  project.layers[0].cells = [project.amsColors[1].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  const entries = readZipEntries(createThreeMf(model));
  const decoder = new TextDecoder();
  const componentObjectIds = parseComponentObjectIds(decoder.decode(entries.get("3D/3dmodel.model")));
  const partIds = parseModelSettings(decoder.decode(entries.get("Metadata/model_settings.config")))
    .map(({ id }) => id);
  assert.deepEqual(partIds, componentObjectIds);
});

test("project settings include exactly one 0.4 mm nozzle entry", () => {
  const project = createProject(1, 1);
  project.layers[0].cells = [project.amsColors[1].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  const settings = JSON.parse(new TextDecoder().decode(
    readZipEntries(createThreeMf(model)).get("Metadata/project_settings.config"),
  ));
  assert.deepEqual(settings.nozzle_diameter, ["0.4"]);
  assert.equal(settings.layer_height, undefined);
  assert.equal(settings.initial_layer_print_height, undefined);
});

test("default three-slot 3MF keeps White, Black, and Red assignments", () => {
  const fresh = createProject(1, 1);
  fresh.layers[0].cells = [fresh.amsColors[1].id];
  const model = buildPrintableModel(composePrintableGrid(fresh));
  const entries = readZipEntries(createThreeMf(model));
  const decoder = new TextDecoder();
  const projectSettings = JSON.parse(decoder.decode(entries.get("Metadata/project_settings.config")));
  assert.deepEqual(projectSettings.filament_colour, ["#F4F1E8", "#1C1C1C", "#ED2B2B"]);
  assert.deepEqual(projectSettings.filament_colour, fresh.amsColors.map((material) => material.hex.toUpperCase()));
  const modelXml = decoder.decode(entries.get("3D/3dmodel.model"));
  assert.deepEqual(
    parseModelSettings(decoder.decode(entries.get("Metadata/model_settings.config"))),
    expectedPartAssignments(model, parseComponentObjectIds(modelXml)),
  );
});

test("3MF rejects missing material references and malformed material colors", () => {
  const project = createProject(1, 1);
  project.layers[0].cells = [project.amsColors[1].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  model.parts[0].materialId = "missing";
  assert.throws(() => createThreeMf(model), /references a missing material/);

  model.parts[0].materialId = model.materials[0].id;
  model.materials[0].hex = "white";
  assert.throws(() => createThreeMf(model), /six-digit hex color/);
});

test("3MF nozzle metadata follows the project material profile", () => {
  const project = createProject(1, 1);
  project.materialProfile.nozzleDiameterMm = 0.6;
  const settings = JSON.parse(new TextDecoder().decode(
    readZipEntries(createThreeMf(buildPrintableModel(composePrintableGrid(project))))
      .get("Metadata/project_settings.config"),
  ));
  assert.deepEqual(settings.nozzle_diameter, ["0.6"]);
});

test("3MF escapes XML names and rejects illegal XML control characters", () => {
  const project = createProject(1, 1);
  project.name = "Bracelet & <Heart>";
  project.amsColors[0].name = "A&B";
  let model = buildPrintableModel(composePrintableGrid(project));
  const entries = readZipEntries(createThreeMf(model));
  assert.equal(model.name, project.name);
  assert.match(new TextDecoder().decode(entries.get("3D/3dmodel.model")), /name="Bracelet &amp; &lt;Heart&gt;"/);
  assert.match(new TextDecoder().decode(entries.get("Metadata/model_settings.config")), /value="Bracelet &amp; &lt;Heart&gt;"/);
  assert.match(new TextDecoder().decode(entries.get("3D/3dmodel.model")), /A&amp;B/);

  project.amsColors[0].name = "bad\u0001name";
  model = buildPrintableModel(composePrintableGrid(project));
  assert.throws(() => createThreeMf(model), /XML 1.0/);
});

test("3MF rejects non-integer or non-finite grid dimensions", () => {
  for (const width of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    const model = buildPrintableModel(composePrintableGrid(createProject(1, 1)));
    model.gridSize.width = width;
    assert.throws(() => createThreeMf(model), /positive whole numbers/);
  }
});

test("layered 3MF exports only physical material bands", () => {
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  const entries = readZipEntries(createThreeMf(model));
  const decoder = new TextDecoder();
  const xml = decoder.decode(entries.get("3D/3dmodel.model"));
  const modelSettings = decoder.decode(entries.get("Metadata/model_settings.config"));
  const projectSettings = JSON.parse(decoder.decode(entries.get("Metadata/project_settings.config")));
  const recipe = JSON.parse(decoder.decode(entries.get("Metadata/beadrelief_recipe.config")));
  assert.equal(projectSettings.layer_height, "0.08");
  assert.equal(projectSettings.initial_layer_print_height, "0.08");
  assert.equal((xml.match(/<base /g) ?? []).length, 4);
  assert.equal((xml.match(/<component objectid=/g) ?? []).length, 4);
  assert.deepEqual(parseModelSettings(modelSettings), expectedPartAssignments(model, parseComponentObjectIds(xml)));
  assert.doesNotMatch(xml, /Estimated_/);
  assert.match(xml, /Base_and_Beads_Bambu_PLA_Basic_Blue/);
  assert.match(xml, /Stack_Bambu_PLA_Basic_White/);
  assert.equal(recipe.mode, "layered");
  assert.deepEqual(recipe.layers.map(({ slot }) => slot), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
});

test("heart sample keeps its deterministic 10 by 10 three-color footprint", async () => {
  const project = JSON.parse(await readFile("samples/beadrelief-heart-project.json", "utf8"));
  assert.deepEqual(
    [project.width, project.height, project.printSettings.cellPitchMm],
    [10, 10, 2.5],
  );
  assert.equal(project.printSettings.mode, "solid");
  assert.equal(project.amsColors.length, 3);
  assert.deepEqual(
    project.amsColors.map(({ name, hex }) => [name, hex]),
    [["White", "#f4f1e8"], ["Black", "#1c1c1c"], ["Red", "#ed2b2b"]],
  );
  const [white, black, red] = project.amsColors;
  assert.equal(project.printSettings.baseColorId, white.id);
  const orderedIds = [white.id, black.id, red.id];
  assert.deepEqual([...new Set(project.cells)], orderedIds);
  assert.deepEqual([...new Set(project.layers[0].cells)], orderedIds);
  assert.deepEqual(project.cells, project.layers[0].cells);
  assert.deepEqual(buildPrintableModel(composePrintableGrid(project)).sizeMm, {
    x: 25,
    y: 25,
    z: 2,
  });
});

test("committed samples include Bambu color and part-assignment metadata", async () => {
  for (const filename of [
    "samples/beadrelief-heart-p2s.3mf",
    "samples/beadrelief-p2s-sample.3mf",
    "samples/beadrelief-p2s-layered-sample.3mf",
  ]) {
    const entries = readZipEntries(await readFile(filename));
    assert.ok(entries.has("Metadata/project_settings.config"), `${filename} is missing project settings`);
    assert.ok(entries.has("Metadata/model_settings.config"), `${filename} is missing model settings`);
  }
});
