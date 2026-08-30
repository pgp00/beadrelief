import test from "node:test";
import assert from "node:assert/strict";
import { createProject, withStackTemplate } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";

globalThis.React = {
  useEffect() {},
  useMemo() {},
  useRef() {},
  useState() {},
};

const { createPatternPreviewGroup, createPreviewGroup } = await import("../generated/dist/src/ThreePreview.js");

test("3D preview meshes reuse the exact printable vertices, indices, and colors", () => {
  const project = createProject(1, 1);
  project.layers[0].cells = ["ams-3-ed2b2b"];
  const model = buildPrintableModel(composePrintableGrid(project));
  const group = createPreviewGroup(model);
  assert.equal(group.children.length, model.parts.length);
  assert.equal(group.rotation.x, -Math.PI / 2);
  model.parts.forEach((part, index) => {
    const mesh = group.children[index];
    assert.deepEqual(Array.from(mesh.geometry.getAttribute("position").array), Array.from(part.vertices));
    assert.deepEqual(Array.from(mesh.geometry.index.array), Array.from(part.triangles));
    const material = model.materials.find((item) => item.id === part.materialId);
    assert.equal(mesh.material.color.getHexString(), material.hex.slice(1));
  });
});

test("layered preview adds estimated top colors without replacing print bands", () => {
  const project = withStackTemplate(createProject(2, 1), "rybw");
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[0].id, palette[12].id];
  const model = buildPrintableModel(composePrintableGrid(project));
  const group = createPreviewGroup(model);
  assert.equal(group.children.length, model.parts.length + model.previewParts.length);
  assert.equal(group.children.filter((mesh) => mesh.userData.previewOverlay).length, 2);
  assert.deepEqual(
    group.children.filter((mesh) => mesh.userData.previewOverlay).map((mesh) => `#${mesh.material.color.getHexString()}`),
    model.previewParts.map((part) => part.color),
  );
});

test("large bead patterns use one lightweight instanced cylinder per color", () => {
  const project = createProject(180, 180);
  project.layers[0].cells.fill("mard-a1");
  const group = createPatternPreviewGroup(project);
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0].count, 180 * 180);
  assert.equal(group.children[0].geometry.type, "CylinderGeometry");
});
