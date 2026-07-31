import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../generated/dist/src/project.js";
import { composePrintableGrid, buildPrintableModel } from "../generated/dist/src/print/model.js";

globalThis.React = {
  useEffect() {},
  useMemo() {},
  useRef() {},
  useState() {},
};

const { createPreviewGroup } = await import("../generated/dist/src/ThreePreview.js");

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
