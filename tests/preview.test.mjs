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

test("estimated surfaces follow layer selection and exploded material bands", () => {
  const stops = [4, 5, 6, 7, 8, 12, 13, 16];
  const project = withStackTemplate(createProject(stops.length, 1), "rybw");
  project.printSettings.separateBase = true;
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = stops.map((stop) => palette.find((color) => color.stopLevel === stop).id);
  const model = buildPrintableModel(composePrintableGrid(project));
  const cases = [
    [{}, stops],
    [{ singleLayer: true }, stops],
    [{ layer: 4 }, [4]],
    [{ layer: 6 }, [4, 5, 6]],
    [{ layer: 3, singleLayer: true }, []],
    ...[4, 5, 6, 7, 8, 13, 16].map((layer) => [{ layer, singleLayer: true }, [layer]]),
    [{ exploded: true }, stops],
    [{ singleLayer: true, exploded: true }, stops],
    [{ layer: 6, exploded: true }, [4, 5, 6]],
    ...[4, 5, 6, 7, 16].map((layer) => [{ layer, singleLayer: true, exploded: true }, [layer]]),
  ];
  for (const [options, expectedStops] of cases) {
    const group = createPreviewGroup(model, options);
    const overlays = group.children.filter((mesh) => mesh.userData.previewOverlay);
    assert.deepEqual(overlays.map((mesh) => Number(mesh.name.match(/L(\d+)$/)[1])), expectedStops, JSON.stringify(options));
    group.updateMatrixWorld(true);
    for (const mesh of group.children) {
      const overlay = mesh.userData.previewOverlay;
      const stop = overlay ? Number(mesh.name.match(/L(\d+)$/)[1]) : null;
      const materialIndex = overlay
        ? model.recipe.layers.find((layer) => layer.layer === stop).slot - 1
        : model.materials.findIndex((material) => material.id === model.parts.find((part) => part.name === mesh.name).materialId);
      assert.equal(mesh.position.z, options.exploded ? materialIndex * model.settings.cellPitchMm * 0.18 : 0, mesh.name);
      const planes = mesh.material.clippingPlanes ?? [];
      assert.equal(planes.length, options.layer ? (options.singleLayer ? 2 : 1) : 0, mesh.name);
      if (!options.layer) continue;
      mesh.geometry.computeBoundingBox();
      const surfaceOffset = overlay
        ? mesh.geometry.boundingBox.max.z - model.recipe.baseThicknessMm - stop * model.recipe.layerHeightMm
        : 0;
      const shift = mesh.position.z + surfaceOffset;
      assert.ok(Math.abs(planes[0].constant - (model.recipe.baseThicknessMm + options.layer * model.recipe.layerHeightMm + shift)) < 1e-5);
      if (options.singleLayer) {
        assert.ok(Math.abs(planes[1].constant + model.recipe.baseThicknessMm + (options.layer - 1) * model.recipe.layerHeightMm + shift) < 1e-5);
      }
      if (overlay) {
        const positions = mesh.geometry.getAttribute("position");
        for (let index = 0; index < positions.count; index += 1) {
          const vertex = mesh.position.clone().set(positions.getX(index), positions.getY(index), positions.getZ(index));
          mesh.localToWorld(vertex);
          assert.ok(planes.every((plane) => plane.distanceToPoint(vertex) >= -1e-6), `${mesh.name} top and dimple remain visible`);
        }
      }
    }
    for (const mesh of group.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
});

test("large bead patterns use one lightweight instanced cylinder per color", () => {
  const project = createProject(180, 180);
  project.layers[0].cells.fill("mard-a1");
  const group = createPatternPreviewGroup(project);
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0].count, 180 * 180);
  assert.equal(group.children[0].geometry.type, "CylinderGeometry");
});
