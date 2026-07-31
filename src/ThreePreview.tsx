import * as THREE from 'three';
import type { PrintableModel, PrintablePart } from './print/model';

const { useEffect, useRef, useState } = React;
const PREVIEW_BACKGROUND = 0x242422;

type PreviewRefs = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  root: THREE.Group;
  content: THREE.Group;
  frame: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
};

type Props = {
  model: PrintableModel;
  title: string;
  emptyLabel: string;
  closeLabel: string;
  expandLabel: string;
};

export default function ThreePreview({ model, title, emptyLabel, closeLabel, expandLabel }: Props) {
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
  const beadCount = model.gridSize.width * model.gridSize.height;

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
    preview.content.add(createPreviewGroup(model));

    const span = Math.max(model.sizeMm.x, model.sizeMm.y, 20);
    controlsRef.current.minDistance = Math.max(3.5, span * 0.35);
    controlsRef.current.maxDistance = Math.max(12, span * 3.8);
    controlsRef.current.distance = clamp(span * 1.25, controlsRef.current.minDistance, controlsRef.current.maxDistance);
    controlsRef.current.targetY = model.sizeMm.z / 2;
    updateCamera(preview, controlsRef.current);
  }, [model, expanded]);

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

export function toBufferGeometry(part: PrintablePart): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(part.vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(part.triangles, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function createPreviewGroup(model: PrintableModel): THREE.Group {
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2;
  group.position.set(-model.sizeMm.x / 2, 0, model.sizeMm.y / 2);
  for (const part of model.parts) {
    const color = model.materials.find((material) => material.id === part.materialId);
    if (!color) continue;
    const mesh = new THREE.Mesh(
      toBufferGeometry(part),
      new THREE.MeshStandardMaterial({ color: color.hex, roughness: 0.72, metalness: 0 }),
    );
    mesh.name = part.name;
    group.add(mesh);
  }
  return group;
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
