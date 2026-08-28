import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProject } from "../generated/dist/src/project.js";
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
  project.layers[0].cells = [
    "ams-1-1c1c1c", "ams-2-f4f1e8",
    "ams-3-ed2b2b", "ams-4-2864dc",
  ];
  const model = buildPrintableModel(composePrintableGrid(project));
  const archive = createThreeMf(model);
  assert.deepEqual(archive, createThreeMf(model));
  const entries = readStoredEntries(archive);
  assert.deepEqual([...entries.keys()], [
    "[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model",
  ]);
  const decoder = new TextDecoder();
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

test("layered 3MF exports only physical material bands", async () => {
  const { withStackTemplate } = await import("../generated/dist/src/project.js");
  const { buildStackPalette } = await import("../generated/dist/src/print/stacking.js");
  const project = withStackTemplate(createProject(4, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[4].id, palette[8].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  const xml = new TextDecoder().decode(readStoredEntries(createThreeMf(model)).get("3D/3dmodel.model"));
  assert.equal((xml.match(/<base /g) ?? []).length, 4);
  assert.equal((xml.match(/<component objectid=/g) ?? []).length, 4);
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
