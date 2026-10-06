import * as THREE from 'three';
import { getColor } from './palette.js';
import type { PrintableModel } from './print/model.js';
import { STACK_LAYERS_PER_FILAMENT } from './print/stacking.js';
import type { BeadProject } from './types.js';

const { useEffect, useRef, useState } = React;
const PREVIEW_BACKGROUND = 0x242422;
const PREVIEW_SURFACE_OFFSET_MM = 0.002; // Matches appendFusedBeadTop's offset above the print surface.

type PreviewRefs = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  root: THREE.Group;
  content: THREE.Group;
  dragging: boolean;
  lastX: number;
  lastY: number;
};

type CommonProps = {
  title: string;
  emptyLabel: string;
  closeLabel: string;
  expandLabel: string;
  webglErrorLabel: string;
  previewLayerLabel: string;
  singleLayerLabel: string;
  explodedLabel: string;
};

type Props = CommonProps & ({ model: PrintableModel; project?: never } | { project: BeadProject; model?: never });

export default function ThreePreview({ model, project, title, emptyLabel, closeLabel, expandLabel, webglErrorLabel, previewLayerLabel, singleLayerLabel, explodedLabel }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const refs = useRef<PreviewRefs | null>(null);
  const controlsRef = useRef({
    yaw: -0.12,
    pitch: 0.95,
    distance: 18,
    minDistance: 4,
    maxDistance: 80,
    targetY: 0,
  });
  const [expanded, setExpanded] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const maximumLayer = model?.recipe.layers.length ?? 0;
  const [previewLayer, setPreviewLayer] = useState(maximumLayer);
  const [singleLayer, setSingleLayer] = useState(false);
  const [exploded, setExploded] = useState(false);
  const beadCount = project
    ? project.layers.filter((layer) => layer.visible).reduce((sum, layer) => sum + layer.cells.filter(Boolean).length, 0)
    : model.gridSize.width * model.gridSize.height;

  useEffect(() => {
    const host = expanded ? modalHostRef.current : hostRef.current;
    if (!host) return;
    const container = host;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1000);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
      setWebglUnavailable(true);
      console.warn('3D preview could not start.', error);
      return;
    }
    setWebglUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(PREVIEW_BACKGROUND, 0);
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a38, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(6, 10, 8);
    scene.add(keyLight);

    const content = new THREE.Group();
    root.add(content);

    const preview: PreviewRefs = {
      scene,
      camera,
      renderer,
      root,
      content,
      dragging: false,
      lastX: 0,
      lastY: 0,
    };
    refs.current = preview;

    function resize() {
      const width = Math.max(180, container.clientWidth);
      const height = Math.max(160, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      updateCamera(preview, controlsRef.current);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    function pointerDown(event: PointerEvent) {
      event.preventDefault();
      preview.dragging = true;
      preview.lastX = event.clientX;
      preview.lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function pointerMove(event: PointerEvent) {
      if (!preview.dragging) return;
      const dx = event.clientX - preview.lastX;
      const dy = event.clientY - preview.lastY;
      const controls = controlsRef.current;
      controls.yaw -= dx * 0.01;
      controls.pitch = wrapAngle(controls.pitch + dy * 0.008);
      preview.lastX = event.clientX;
      preview.lastY = event.clientY;
      updateCamera(preview, controls);
    }

    function pointerUp(event: PointerEvent) {
      preview.dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    }

    function wheel(event: WheelEvent) {
      event.preventDefault();
      const controls = controlsRef.current;
      const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
      controls.distance = clamp(controls.distance * zoomFactor, controls.minDistance, controls.maxDistance);
      updateCamera(preview, controls);
    }

    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointercancel', pointerUp);
    renderer.domElement.addEventListener('wheel', wheel, { passive: false });

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerUp);
      renderer.domElement.removeEventListener('wheel', wheel);
      container.removeChild(renderer.domElement);
      disposeGroup(content);
      renderer.dispose();
      refs.current = null;
    };
  }, [expanded]);

  useEffect(() => {
    const preview = refs.current;
    if (!preview) return;

    disposeGroup(preview.content);
    preview.content.clear();
    preview.content.add(project ? createPatternPreviewGroup(project) : createPreviewGroup(model, {
      layer: previewLayer || maximumLayer,
      singleLayer,
      exploded,
    }));

    const span = project
      ? Math.max(project.width, project.height, 8) * 0.72
      : Math.max(model.sizeMm.x, model.sizeMm.y, 20);
    controlsRef.current.minDistance = Math.max(3.5, span * 0.35);
    controlsRef.current.maxDistance = Math.max(12, span * 3.8);
    controlsRef.current.distance = clamp(span * 1.25, controlsRef.current.minDistance, controlsRef.current.maxDistance);
    controlsRef.current.targetY = project
      ? Math.max(0, (project.layers.filter((layer) => layer.visible).length - 1) * 0.31)
      : model.sizeMm.z / 2;
    updateCamera(preview, controlsRef.current);
  }, [model, project, expanded, previewLayer, maximumLayer, singleLayer, exploded]);

  useEffect(() => {
    setPreviewLayer(maximumLayer);
    setSingleLayer(false);
    setExploded(false);
  }, [maximumLayer, model?.mode]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (expanded && dialog && !dialog.open) dialog.showModal();
  }, [expanded]);

  return (
    <>
      <div className="three-preview" ref={hostRef} aria-label={title}>
        {beadCount === 0 && (
          <div className="three-preview-empty" aria-hidden="true">
            <div className="three-preview-empty-icon">
              <span />
              <span />
              <span />
              <span />
            </div>
            <p>{emptyLabel}</p>
          </div>
        )}
        {webglUnavailable && <p className="three-preview-error" role="status">{webglErrorLabel}</p>}
        <button ref={expandButtonRef} className="preview-expand-button" title={expandLabel} onClick={() => setExpanded(true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7.5 3.5H3.5v4M12.5 3.5h4v4M7.5 16.5H3.5v-4M12.5 16.5h4v-4" />
            <path d="M3.8 3.8l4.4 4.4M16.2 3.8l-4.4 4.4M3.8 16.2l4.4-4.4M16.2 16.2l-4.4-4.4" />
          </svg>
        </button>
      </div>
      {expanded && (
        <dialog
          ref={dialogRef}
          className="three-preview-modal"
          aria-label={title}
          onClose={() => {
            setExpanded(false);
            expandButtonRef.current?.focus();
          }}
        >
          <div className="three-preview-modal-panel">
            <div className="three-preview-modal-bar">
              <strong>{title}</strong>
              {maximumLayer > 0 && <div className="preview-layer-controls">
                <label>
                  <span>{previewLayerLabel} {previewLayer}/{maximumLayer}</span>
                  <input
                    aria-label={previewLayerLabel}
                    type="range"
                    min={1}
                    max={maximumLayer}
                    value={Math.min(maximumLayer, Math.max(1, previewLayer))}
                    onChange={(event) => setPreviewLayer(Number(event.target.value))}
                  />
                </label>
                <label><input type="checkbox" checked={singleLayer} onChange={(event) => setSingleLayer(event.target.checked)} /> {singleLayerLabel}</label>
                <label><input type="checkbox" checked={exploded} onChange={(event) => setExploded(event.target.checked)} /> {explodedLabel}</label>
              </div>}
              <button onClick={() => dialogRef.current?.close()}>{closeLabel}</button>
            </div>
            <div className="three-preview-modal-stage" ref={modalHostRef}>
              {beadCount === 0 && (
                <div className="three-preview-empty modal-empty" aria-hidden="true">
                  <div className="three-preview-empty-icon">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <p>{emptyLabel}</p>
                </div>
              )}
              {webglUnavailable && <p className="three-preview-error" role="status">{webglErrorLabel}</p>}
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}

function updateCamera(preview: PreviewRefs, controls: { yaw: number; pitch: number; distance: number; targetY: number }) {
  const horizontal = Math.cos(controls.pitch) * controls.distance;
  preview.camera.up.set(0, horizontal >= 0 ? 1 : -1, 0);
  preview.camera.position.set(
    Math.sin(controls.yaw) * horizontal,
    controls.targetY + Math.sin(controls.pitch) * controls.distance,
    Math.cos(controls.yaw) * horizontal,
  );
  preview.camera.lookAt(0, controls.targetY, 0);
  preview.renderer.render(preview.scene, preview.camera);
}

function wrapAngle(value: number): number {
  const fullTurn = Math.PI * 2;
  return ((((value + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toBufferGeometry(part: { vertices: Float32Array; triangles: Uint32Array }): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(part.vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(part.triangles, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function createPreviewGroup(
  model: PrintableModel,
  options: { layer?: number; singleLayer?: boolean; exploded?: boolean } = {},
): THREE.Group {
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2;
  group.position.set(-model.sizeMm.x / 2, 0, model.sizeMm.y / 2);
  for (const part of model.parts) {
    const color = model.materials.find((material) => material.id === part.materialId);
    if (!color) continue;
    const materialIndex = model.materials.findIndex((material) => material.id === part.materialId);
    const zOffset = options.exploded ? materialIndex * model.settings.cellPitchMm * 0.18 : 0;
    const clippingPlanes = previewClippingPlanes(model, options.layer, options.singleLayer, zOffset);
    const mesh = new THREE.Mesh(
      toBufferGeometry(part),
      new THREE.MeshStandardMaterial({ color: color.hex, roughness: 0.72, metalness: 0, clippingPlanes }),
    );
    mesh.name = part.name;
    mesh.position.z = zOffset;
    group.add(mesh);
  }
  for (const part of model.previewParts) {
    const stopLevel = Number(/L(\d+)$/.exec(part.name)?.[1]);
    if (options.layer && Number.isFinite(stopLevel)
      && (stopLevel > options.layer || (options.singleLayer && stopLevel !== options.layer))) continue;
    const materialIndex = Math.ceil(stopLevel / STACK_LAYERS_PER_FILAMENT) - 1;
    const zOffset = options.exploded ? materialIndex * model.settings.cellPitchMm * 0.18 : 0;
    const clippingPlanes = previewClippingPlanes(model, options.layer, options.singleLayer, zOffset + PREVIEW_SURFACE_OFFSET_MM);
    const mesh = new THREE.Mesh(
      toBufferGeometry(part),
      new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.72, metalness: 0, clippingPlanes }),
    );
    mesh.name = part.name;
    mesh.position.z = zOffset;
    mesh.userData.previewOverlay = true;
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}

export function createPatternPreviewGroup(project: BeadProject): THREE.Group {
  const group = new THREE.Group();
  const spacing = 0.72;
  const beadRadius = 0.31;
  const beadHeight = beadRadius * 2;
  const cellCount = project.width * project.height;
  const byColor = new Map<string, number[]>();
  const visibleLayers = project.layers.filter((layer) => layer.visible);
  visibleLayers.forEach((layer, layerIndex) => {
    layer.cells.forEach((colorId, index) => {
      if (!colorId) return;
      const items = byColor.get(colorId) ?? [];
      items.push(layerIndex * cellCount + index);
      byColor.set(colorId, items);
    });
  });
  const geometry = project.settings.beadDisplayMode === 'pixel'
    ? new THREE.BoxGeometry(beadRadius * 2, beadHeight, beadRadius * 2)
    : createRoundBeadGeometry(beadRadius, beadHeight);
  const matrix = new THREE.Matrix4();
  byColor.forEach((items, colorId) => {
    const color = getColor(colorId);
    if (!color) return;
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: color.hex, roughness: 0.72, metalness: 0 }),
      items.length,
    );
    items.forEach((encoded, itemIndex) => {
      const layerIndex = Math.floor(encoded / cellCount);
      const index = encoded % cellCount;
      const x = index % project.width;
      const y = Math.floor(index / project.width);
      matrix.makeTranslation(
        (x - (project.width - 1) / 2) * spacing,
        layerIndex * beadHeight,
        (y - (project.height - 1) / 2) * spacing,
      );
      mesh.setMatrixAt(itemIndex, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  });
  if (byColor.size === 0) geometry.dispose();
  return group;
}

function previewClippingPlanes(model: PrintableModel, layer?: number, singleLayer?: boolean, zOffset = 0): THREE.Plane[] {
  if (model.mode !== 'layered' || !model.recipe.layerHeightMm || !layer) return [];
  const upper = model.recipe.baseThicknessMm + layer * model.recipe.layerHeightMm + zOffset;
  // Float32 mesh coordinates can lie just outside an exact layer boundary.
  const result = [new THREE.Plane(new THREE.Vector3(0, -1, 0), upper + 1e-6)];
  if (singleLayer) {
    const lower = model.recipe.baseThicknessMm + (layer - 1) * model.recipe.layerHeightMm + zOffset;
    result.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -lower + 1e-6));
  }
  return result;
}

function createRoundBeadGeometry(radius: number, height: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, height, 16);
}

function disposeGroup(group: THREE.Group) {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!disposedGeometries.has(object.geometry)) {
      object.geometry.dispose();
      disposedGeometries.add(object.geometry);
    }
    disposeMaterial(object.material);
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
    return;
  }
  material.dispose();
}
