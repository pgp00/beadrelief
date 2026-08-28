import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProject } from "../generated/dist/src/project.js";
import { DEFAULT_AMS_COLORS } from "../generated/dist/src/print/colors.js";
import { composePrintableGrid, buildPrintableModel, meshBounds } from "../generated/dist/src/print/model.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";

function readStoredEntries(archive) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decoder = new TextDecoder();
  const entries = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(archive.slice(nameStart, nameStart + nameLength));
    entries.set(name, archive.slice(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  return entries;
}

test("3MF contains one assembly, named parts, and four or fewer base materials", () => {
  const project = createProject(2, 2);
  project.amsColors = DEFAULT_AMS_COLORS.map((material) => ({ ...material }));
  project.layers[0].cells = project.amsColors.map((material) => material.id);
  const model = buildPrintableModel(composePrintableGrid(project));
  const archive = createThreeMf(model);
  assert.deepEqual(archive, createThreeMf(model));
  const entries = readStoredEntries(archive);
  assert.deepEqual([...entries.keys()], [
    "[Content_Types].xml",
    "_rels/.rels",
    "3D/3dmodel.model",
    "Metadata/project_settings.config",
    "Metadata/model_settings.config",
  ]);
  const decoder = new TextDecoder();
  const projectSettings = JSON.parse(decoder.decode(entries.get("Metadata/project_settings.config")));
  assert.deepEqual(projectSettings.filament_colour, model.materials.map((material) => material.hex.toUpperCase()));
  assert.deepEqual(projectSettings.filament_type, model.materials.map(() => "PLA"));
  const modelSettings = decoder.decode(entries.get("Metadata/model_settings.config"));
  model.parts.forEach((part, index) => {
    const materialIndex = model.materials.findIndex((material) => material.id === part.materialId);
    assert.notEqual(materialIndex, -1);
    assert.match(
      modelSettings,
      new RegExp(`<part id="${index + 1}"[\\s\\S]*?key="extruder" value="${materialIndex + 1}"`),
    );
  });
  const relationships = decoder.decode(entries.get("_rels/.rels"));
  assert.match(relationships, /Target="\/3D\/3dmodel\.model"/);
  const xml = decoder.decode(entries.get("3D/3dmodel.model"));
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

test("layered 3MF exports only physical material bands", async () => {
  const { withStackTemplate } = await import("../generated/dist/src/project.js");
  const { buildStackPalette } = await import("../generated/dist/src/print/stacking.js");
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  const entries = readStoredEntries(createThreeMf(model));
  const decoder = new TextDecoder();
  const xml = decoder.decode(entries.get("3D/3dmodel.model"));
  const modelSettings = decoder.decode(entries.get("Metadata/model_settings.config"));
  assert.equal((xml.match(/<base /g) ?? []).length, 4);
  assert.equal((xml.match(/<component objectid=/g) ?? []).length, 4);
  assert.equal((modelSettings.match(/<part id="/g) ?? []).length, model.parts.length);
  assert.doesNotMatch(xml, /Estimated_/);
  assert.match(xml, /Base_and_Beads_Bambu_PLA_Basic_Blue/);
  assert.match(xml, /Stack_Bambu_PLA_Basic_White/);
});

test("heart sample keeps its deterministic 10 by 10 three-color footprint", async () => {
  const project = JSON.parse(await readFile("samples/pingdou-heart-project.json", "utf8"));
  assert.deepEqual(
    [project.width, project.height, project.printSettings.cellPitchMm],
    [10, 10, 2.5],
  );
  assert.equal(project.printSettings.mode, "solid");
  assert.equal(project.amsColors.length, 3);
  assert.equal(project.printSettings.baseColorId, "ams-2-f4f1e8");
  assert.deepEqual(buildPrintableModel(composePrintableGrid(project)).sizeMm, {
    x: 25,
    y: 25,
    z: 2,
  });
});
