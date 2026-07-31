import * as THREE from 'three';
import { getColor } from './palette';
import type { BeadProject } from './types';

const { useEffect, useMemo, useRef, useState } = React;
const BEAD_RADIUS = 0.31;
const BEAD_HEIGHT = BEAD_RADIUS * 2;
const LAYER_LIFT = BEAD_HEIGHT;
const PREVIEW_BACKGROUND = 0x242422;

type PreviewRefs = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  root: THREE.Group;
  beads: THREE.Group;
  frame: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
};

type Props = {
  project: BeadProject;
  title: string;
  emptyLabel: string;
  closeLabel: string;
  expandLabel: string;
};

export default function ThreePreview({ project, title, emptyLabel, closeLabel, expandLabel }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
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
  const beadCount = useMemo(
    () =>
      (project.layers ?? [])
        .filter((layer) => layer.visible)
        .reduce((sum, layer) => sum + (layer.cells ?? []).filter(Boolean).length, 0),
    [project.layers],
  );

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
      console.warn('3D preview could not start.', error);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(PREVIEW_BACKGROUND, 0);
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);

    const beads = new THREE.Group();
    root.add(beads);

    const preview: PreviewRefs = {
      scene,
      camera,
      renderer,
      root,
      beads,
      frame: 0,
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

    function animate() {
      renderer.render(scene, camera);
      preview.frame = window.requestAnimationFrame(animate);
    }
    animate();

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
      window.cancelAnimationFrame(preview.frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerUp);
      renderer.domElement.removeEventListener('wheel', wheel);
      container.removeChild(renderer.domElement);
      disposeGroup(beads);
      renderer.dispose();
      refs.current = null;
    };
  }, [expanded]);

  useEffect(() => {
    const preview = refs.current;
    if (!preview) return;

    disposeGroup(preview.beads);
    preview.beads.clear();

    const spacing = 0.72;
    const byColor = new Map<string, Array<[number, number, number]>>();
    const visibleLayers = (project.layers ?? []).filter((layer) => layer.visible);
    visibleLayers.forEach((layer, layerIndex) => {
      (layer.cells ?? []).forEach((colorId, index) => {
        if (!colorId) return;
        const x = index % project.width;
        const y = Math.floor(index / project.width);
        const items = byColor.get(colorId) ?? [];
        items.push([x, y, layerIndex]);
        byColor.set(colorId, items);
      });
    });

    const beadGeometry = createBeadGeometry(project.settings.beadDisplayMode === 'pixel' ? 'square' : 'round');
    const matrix = new THREE.Matrix4();
    byColor.forEach((items, colorId) => {
      const color = getColor(colorId);
      if (!color) return;
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color.hex),
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.InstancedMesh(beadGeometry, material, items.length);
      items.forEach(([x, y, layerIndex], itemIndex) => {
        matrix.makeTranslation(
          (x - (project.width - 1) / 2) * spacing,
          layerIndex * LAYER_LIFT,
          (y - (project.height - 1) / 2) * spacing,
        );
        mesh.setMatrixAt(itemIndex, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      preview.beads.add(mesh);
    });
    if (byColor.size === 0) beadGeometry.dispose();

    const span = Math.max(project.width, project.height, 8) * spacing;
    controlsRef.current.minDistance = Math.max(3.5, span * 0.35);
    controlsRef.current.maxDistance = Math.max(12, span * 3.8);
    controlsRef.current.distance = clamp(span * 1.25, controlsRef.current.minDistance, controlsRef.current.maxDistance);
    controlsRef.current.targetY = Math.max(0, ((visibleLayers.length - 1) * LAYER_LIFT) / 2);
    updateCamera(preview, controlsRef.current);
  }, [project, expanded]);

  return (
    <>
      <div className="three-preview" ref={hostRef} aria-label="Live 3D bead preview">
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
        <button className="preview-expand-button" title={expandLabel} onClick={() => setExpanded(true)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7.5 3.5H3.5v4M12.5 3.5h4v4M7.5 16.5H3.5v-4M12.5 16.5h4v-4" />
            <path d="M3.8 3.8l4.4 4.4M16.2 3.8l-4.4 4.4M3.8 16.2l4.4-4.4M16.2 16.2l-4.4-4.4" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="three-preview-modal" role="dialog" aria-modal="true" aria-label={title}>
          <div className="three-preview-modal-panel">
            <div className="three-preview-modal-bar">
              <strong>{title}</strong>
              <button onClick={() => setExpanded(false)}>{closeLabel}</button>
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
            </div>
          </div>
        </div>
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
}

function wrapAngle(value: number): number {
  const fullTurn = Math.PI * 2;
  return ((((value + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createBeadGeometry(shapeMode: 'round' | 'square') {
  if (shapeMode === 'square') {
    const geometry = new THREE.BoxGeometry(BEAD_RADIUS * 2, BEAD_HEIGHT, BEAD_RADIUS * 2);
    geometry.translate(0, 0, 0);
    return geometry;
  }

  const shape = new THREE.Shape();
  shape.absarc(0, 0, BEAD_RADIUS, 0, Math.PI * 2, false);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: BEAD_HEIGHT,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    curveSegments: 24,
  });
  geometry.center();
  geometry.rotateX(Math.PI / 2);
  return geometry;
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
