import { getColor } from './palette';
import type { ArrowKind, BeadLayer, BeadProject, ClipboardPattern, CopyMode, MirrorDirection, MoveMode, RemoveMode, ShapeFillMode, ShapeKind, TextDirection, ToolId } from './types';

const { useEffect, useMemo, useRef, useState } = React;

type HoverCell = {
  x: number;
  y: number;
  colorId: string | null;
};

type PointerGridPoint = {
  cell: { x: number; y: number } | null;
  gridX: number;
  gridY: number;
};

type ShapeDraft = {
  kind: ShapeKind;
  fillMode: ShapeFillMode;
  arrowKind: ArrowKind;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type ReferenceImagePlacement = 'below' | 'above';

type ReferenceImageRenderOptions = {
  image: HTMLImageElement | null;
  visible: boolean;
  opacity: number;
  scale: number;
  offset: { x: number; y: number };
  placement: ReferenceImagePlacement;
};

type Props = {
  project: BeadProject;
  selectedColorId: string;
  highlightedColorId: string | null;
  highlightedCellIndices: number[];
  formatColorCode?: (colorId: string) => string;
  tool: ToolId;
  eraserSize: number;
  moveMode: MoveMode;
  removeMode: RemoveMode;
  mirrorMode: MoveMode;
  mirrorDirection: MirrorDirection;
  shapeKind: ShapeKind;
  shapeFillMode: ShapeFillMode;
  arrowKind: ArrowKind;
  textToolValue: string;
  textToolDirection: TextDirection;
  textToolSize: number;
  textToolSpacing: number;
  onTextToolSizeChange: (size: number) => void;
  referenceImageUrl: string | null;
  referenceImageVisible: boolean;
  referenceImageOpacity: number;
  referenceImageScale: number;
  referenceImageOffset: { x: number; y: number };
  referenceImageAdjusting: boolean;
  referenceImagePlacement: ReferenceImagePlacement;
  referenceAdjustHint: string;
  onReferenceOffsetChange: (offset: { x: number; y: number }) => void;
  onReferenceScaleChange: (scale: number) => void;
  clipboardPattern: ClipboardPattern | null;
  copyMode: CopyMode;
  copySelectionIndices: number[];
  onCommitStart: () => void;
  onCellsChange: (cells: Array<string | null>) => void;
  onReplaceColor: (sourceColorId: string) => void;
  onCopyPattern: (pattern: ClipboardPattern, switchToPaste?: boolean) => void;
  onCopySelectionChange: (indices: number[], pattern: ClipboardPattern | null) => void;
  onPastePattern: () => void;
  onPickColor: (colorId: string) => void;
  onHover: (cell: HoverCell | null) => void;
  fitLabel: string;
  canEdit: boolean;
  lockedHint: string;
};

export default function WorkspaceCanvas({
  project,
  selectedColorId,
  highlightedColorId,
  highlightedCellIndices,
  formatColorCode,
  tool,
  eraserSize,
  moveMode,
  removeMode,
  mirrorMode,
  mirrorDirection,
  shapeKind,
  shapeFillMode,
  arrowKind,
  textToolValue,
  textToolDirection,
  textToolSize,
  textToolSpacing,
  onTextToolSizeChange,
  referenceImageUrl,
  referenceImageVisible,
  referenceImageOpacity,
  referenceImageScale,
  referenceImageOffset,
  referenceImageAdjusting,
  referenceImagePlacement,
  referenceAdjustHint,
  onReferenceOffsetChange,
  onReferenceScaleChange,
  clipboardPattern,
  copyMode,
  copySelectionIndices,
  onCommitStart,
  onCellsChange,
  onReplaceColor,
  onCopyPattern,
  onCopySelectionChange,
  onPastePattern,
  onPickColor,
  onHover,
  fitLabel,
  canEdit,
  lockedHint,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const draftCellsRef = useRef<Array<string | null>>(getActiveLayerCells(project));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<PointerGridPoint | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);
  const [referenceImage, setReferenceImage] = useState<HTMLImageElement | null>(null);
  const [activePointerMode, setActivePointerMode] = useState<'pan' | 'rightErase' | 'move' | 'shape' | 'reference' | null>(null);
  const pointerRef = useRef({
    drawing: false,
    panning: false,
    erasing: false,
    singleCellErasing: false,
    movingPattern: false,
    draggingReference: false,
    copySelecting: false,
    shaping: false,
    pointerId: 0,
    lastX: 0,
    lastY: 0,
    lastCellX: -1,
    lastCellY: -1,
    lastGridX: 0,
    lastGridY: 0,
    moveStartCellX: 0,
    moveStartCellY: 0,
    moveLastDx: 0,
    moveLastDy: 0,
    moveOriginCells: [] as Array<string | null>,
    moveSelectionIndices: [] as number[],
    referenceOffsetX: 0,
    referenceOffsetY: 0,
    copySelectionAction: 'add' as 'add' | 'remove',
    copySelectionSet: new Set<number>(),
    shapeStartCellX: 0,
    shapeStartCellY: 0,
    shapeLastCellX: 0,
    shapeLastCellY: 0,
  });

  const cellSize = 18;
  const referenceImageOptions = useMemo<ReferenceImageRenderOptions>(
    () => ({
      image: referenceImage,
      visible: referenceImageVisible,
      opacity: referenceImageOpacity,
      scale: referenceImageScale,
      offset: referenceImageOffset,
      placement: referenceImagePlacement,
    }),
    [referenceImage, referenceImageVisible, referenceImageOpacity, referenceImageScale, referenceImageOffset, referenceImagePlacement],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') setIsSpaceDown(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!referenceImageUrl) {
      setReferenceImage(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setReferenceImage(image);
    };
    image.onerror = () => {
      if (!cancelled) setReferenceImage(null);
    };
    image.src = referenceImageUrl;
    return () => {
      cancelled = true;
    };
  }, [referenceImageUrl]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    fitToWindow();
  }, [project.width, project.height, cellSize]);

  useEffect(() => {
    draftCellsRef.current = getActiveLayerCells(project);
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(wrapper.clientWidth * dpr);
    canvas.height = Math.floor(wrapper.clientHeight * dpr);
    canvas.style.width = `${wrapper.clientWidth}px`;
    canvas.style.height = `${wrapper.clientHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPattern(context, project, cellSize, zoom, pan, highlightedColorId, highlightedCellIndices, tool, selectedColorId, eraserSize, moveMode, removeMode, mirrorMode, clipboardPattern, copyMode, copySelectionIndices, shapeDraft, hoverPoint, canEdit, referenceImageOptions, textToolValue, textToolDirection, textToolSize, textToolSpacing, formatColorCode);
  }, [project, cellSize, zoom, pan, highlightedColorId, highlightedCellIndices, tool, selectedColorId, eraserSize, moveMode, removeMode, mirrorMode, clipboardPattern, copyMode, copySelectionIndices, shapeKind, shapeDraft, hoverPoint, canEdit, referenceImageOptions, textToolValue, textToolDirection, textToolSize, textToolSpacing, formatColorCode]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      const wrapper = wrapperRef.current;
      if (!canvas || !wrapper) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(wrapper.clientWidth * dpr);
      canvas.height = Math.floor(wrapper.clientHeight * dpr);
      canvas.style.width = `${wrapper.clientWidth}px`;
      canvas.style.height = `${wrapper.clientHeight}px`;
      const context = canvas.getContext('2d');
      if (context) {
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPattern(context, project, cellSize, zoom, pan, highlightedColorId, highlightedCellIndices, tool, selectedColorId, eraserSize, moveMode, removeMode, mirrorMode, clipboardPattern, copyMode, copySelectionIndices, shapeDraft, hoverPoint, canEdit, referenceImageOptions, textToolValue, textToolDirection, textToolSize, textToolSpacing, formatColorCode);
      }
      setPan((current) => {
        const next = constrainPan(current, zoom);
        return almostSamePoint(current, next) ? current : next;
      });
    });
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [project, cellSize, zoom, pan, highlightedColorId, highlightedCellIndices, tool, selectedColorId, eraserSize, moveMode, removeMode, mirrorMode, clipboardPattern, copyMode, copySelectionIndices, shapeKind, shapeDraft, hoverPoint, canEdit, referenceImageOptions, textToolValue, textToolDirection, textToolSize, textToolSpacing, formatColorCode]);

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = canvasToGridPoint(event.clientX, event.clientY);
    const cell = point?.cell ?? null;
    const rightClickAction = tool === 'pencil' ? project.settings.rightClickAction : 'pan';
    pointerRef.current.pointerId = event.pointerId;
    pointerRef.current.lastX = event.clientX;
    pointerRef.current.lastY = event.clientY;
    pointerRef.current.erasing = false;
    pointerRef.current.singleCellErasing = false;
    pointerRef.current.movingPattern = false;
    pointerRef.current.draggingReference = false;
    pointerRef.current.copySelecting = false;
    pointerRef.current.shaping = false;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (referenceImageAdjusting && referenceImageVisible && event.button === 0) {
      pointerRef.current.draggingReference = true;
      pointerRef.current.referenceOffsetX = referenceImageOffset.x;
      pointerRef.current.referenceOffsetY = referenceImageOffset.y;
      setActivePointerMode('reference');
      return;
    }

    if (tool === 'pan' || event.button === 1 || isSpaceDown || (event.button === 2 && rightClickAction === 'pan')) {
      pointerRef.current.panning = true;
      setActivePointerMode('pan');
      return;
    }

    if (!cell) return;
    if (event.button === 2 && rightClickAction === 'erase') {
      if (!canEdit) return;
      setActivePointerMode('rightErase');
      onCommitStart();
      draftCellsRef.current = getActiveLayerCells(project).slice();
      pointerRef.current.drawing = true;
      pointerRef.current.erasing = true;
      pointerRef.current.singleCellErasing = true;
      pointerRef.current.lastCellX = cell.x;
      pointerRef.current.lastCellY = cell.y;
      pointerRef.current.lastGridX = point?.gridX ?? cell.x + 0.5;
      pointerRef.current.lastGridY = point?.gridY ?? cell.y + 0.5;
      applyTool(cell.x, cell.y, pointerRef.current.lastGridX, pointerRef.current.lastGridY);
      return;
    }

    if (tool === 'eyedropper') {
      const colorId = getTopVisibleColor(project, cell.y * project.width + cell.x);
      if (colorId) onPickColor(colorId);
      return;
    }

    if (tool === 'copy') {
      const activeCells = getActiveLayerCells(project);
      const startIndex = cell.y * project.width + cell.x;
      if (!activeCells[startIndex]) return;
      if (copyMode === 'selection') {
        const selected = new Set(copySelectionIndices);
        pointerRef.current.drawing = true;
        pointerRef.current.copySelecting = true;
        pointerRef.current.copySelectionAction = selected.has(startIndex) ? 'remove' : 'add';
        pointerRef.current.copySelectionSet = selected;
        pointerRef.current.lastCellX = cell.x;
        pointerRef.current.lastCellY = cell.y;
        applyCopySelection([{ x: cell.x, y: cell.y }]);
        return;
      }
      const indices = collectConnectedOccupiedIndices(activeCells, project.width, project.height, cell.x, cell.y);
      const pattern = createClipboardPattern(activeCells, project.width, indices);
      if (pattern.cells.some(Boolean)) onCopyPattern(pattern);
      return;
    }

    if (tool === 'recolor') {
      const sourceColorId = getTopVisibleColor(project, cell.y * project.width + cell.x);
      if (!sourceColorId || sourceColorId === selectedColorId) return;
      onReplaceColor(sourceColorId);
      return;
    }

    if (!canEdit) return;

    if (tool === 'paste') {
      if (!clipboardPattern) return;
      const next = pasteClipboardPattern(getActiveLayerCells(project), project.width, project.height, clipboardPattern, cell.x, cell.y);
      onCommitStart();
      onCellsChange(next);
      onPastePattern();
      return;
    }

    if (tool === 'move') {
      const activeCells = getActiveLayerCells(project);
      const startIndex = cell.y * project.width + cell.x;
      if (!activeCells[startIndex]) return;
      const selectionIndices =
        moveMode === 'partial'
          ? collectConnectedOccupiedIndices(activeCells, project.width, project.height, cell.x, cell.y)
          : [];
      onCommitStart();
      draftCellsRef.current = activeCells.slice();
      pointerRef.current.drawing = true;
      pointerRef.current.movingPattern = true;
      pointerRef.current.lastGridX = point?.gridX ?? cell.x + 0.5;
      pointerRef.current.lastGridY = point?.gridY ?? cell.y + 0.5;
      pointerRef.current.moveStartCellX = Math.floor(point?.gridX ?? cell.x);
      pointerRef.current.moveStartCellY = Math.floor(point?.gridY ?? cell.y);
      pointerRef.current.moveLastDx = 0;
      pointerRef.current.moveLastDy = 0;
      pointerRef.current.moveOriginCells = activeCells.slice();
      pointerRef.current.moveSelectionIndices = selectionIndices;
      setActivePointerMode('move');
      return;
    }

    if (tool === 'mirror') {
      const activeCells = getActiveLayerCells(project);
      const startIndex = cell.y * project.width + cell.x;
      if (!activeCells[startIndex]) return;
      const selectionIndices =
        mirrorMode === 'partial'
          ? collectConnectedOccupiedIndices(activeCells, project.width, project.height, cell.x, cell.y)
          : [];
      const next = mirrorCells(activeCells, project.width, project.height, mirrorDirection, selectionIndices);
      if (next === activeCells) return;
      onCommitStart();
      onCellsChange(next);
      return;
    }

    if (tool === 'shape') {
      onCommitStart();
      draftCellsRef.current = getActiveLayerCells(project).slice();
      pointerRef.current.drawing = true;
      pointerRef.current.shaping = true;
      pointerRef.current.shapeStartCellX = cell.x;
      pointerRef.current.shapeStartCellY = cell.y;
      pointerRef.current.shapeLastCellX = cell.x;
      pointerRef.current.shapeLastCellY = cell.y;
      setShapeDraft({
        kind: shapeKind,
        fillMode: shapeFillMode,
        arrowKind,
        start: { x: cell.x, y: cell.y },
        end: { x: cell.x, y: cell.y },
      });
      setActivePointerMode('shape');
      return;
    }

    if (tool === 'text') {
      const indices = collectTextIndices(textToolValue, textToolDirection, textToolSize, textToolSpacing, cell.x, cell.y, project.width, project.height);
      if (indices.length === 0) return;
      const next = getActiveLayerCells(project).slice();
      indices.forEach((index) => {
        next[index] = selectedColorId;
      });
      onCommitStart();
      onCellsChange(next);
      return;
    }

    onCommitStart();
    draftCellsRef.current = getActiveLayerCells(project).slice();
    if (tool === 'fill') {
      onCellsChange(floodFill(getActiveLayerCells(project), project.width, project.height, cell.x, cell.y, selectedColorId));
      return;
    }

    if (tool === 'remove') {
      const activeCells = getActiveLayerCells(project);
      const startIndex = cell.y * project.width + cell.x;
      if (!activeCells[startIndex]) return;
      const next = activeCells.slice();
      const indices =
        removeMode === 'same-connected'
          ? collectConnectedCellIndices(activeCells, project.width, project.height, cell.x, cell.y)
          : removeMode === 'all-same-color'
            ? collectSameColorIndices(activeCells, cell.x, cell.y, project.width)
            : collectConnectedOccupiedIndices(activeCells, project.width, project.height, cell.x, cell.y);
      indices.forEach((index) => {
        next[index] = null;
      });
      onCellsChange(next);
      return;
    }

    pointerRef.current.drawing = true;
    pointerRef.current.lastCellX = cell.x;
    pointerRef.current.lastCellY = cell.y;
    pointerRef.current.lastGridX = point?.gridX ?? cell.x + 0.5;
    pointerRef.current.lastGridY = point?.gridY ?? cell.y + 0.5;
    applyTool(cell.x, cell.y, pointerRef.current.lastGridX, pointerRef.current.lastGridY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current.draggingReference) {
      const dx = (event.clientX - pointerRef.current.lastX) / (cellSize * zoom);
      const dy = (event.clientY - pointerRef.current.lastY) / (cellSize * zoom);
      pointerRef.current.lastX = event.clientX;
      pointerRef.current.lastY = event.clientY;
      pointerRef.current.referenceOffsetX += dx;
      pointerRef.current.referenceOffsetY += dy;
      onReferenceOffsetChange({
        x: pointerRef.current.referenceOffsetX,
        y: pointerRef.current.referenceOffsetY,
      });
      return;
    }

    if (pointerRef.current.panning) {
      const dx = event.clientX - pointerRef.current.lastX;
      const dy = event.clientY - pointerRef.current.lastY;
      pointerRef.current.lastX = event.clientX;
      pointerRef.current.lastY = event.clientY;
      setPan((current) => constrainPan({ x: current.x + dx, y: current.y + dy }, zoom));
      return;
    }

    const point = canvasToGridPoint(event.clientX, event.clientY, pointerRef.current.movingPattern);
    const cell = point?.cell ?? null;
    setHoverPoint(point);
    onHover(cell ? { ...cell, colorId: getTopVisibleColor(project, cell.y * project.width + cell.x) } : null);
    if (pointerRef.current.copySelecting) {
      if (cell) {
        applyCopySelection(linePoints(pointerRef.current.lastCellX, pointerRef.current.lastCellY, cell.x, cell.y));
        pointerRef.current.lastCellX = cell.x;
        pointerRef.current.lastCellY = cell.y;
      }
      return;
    }
    if (pointerRef.current.drawing && point) {
      if (pointerRef.current.shaping && cell) {
        if (cell.x !== pointerRef.current.shapeLastCellX || cell.y !== pointerRef.current.shapeLastCellY) {
          pointerRef.current.shapeLastCellX = cell.x;
          pointerRef.current.shapeLastCellY = cell.y;
          setShapeDraft({
            kind: shapeKind,
            fillMode: shapeFillMode,
            arrowKind,
            start: { x: pointerRef.current.shapeStartCellX, y: pointerRef.current.shapeStartCellY },
            end: { x: cell.x, y: cell.y },
          });
        }
        return;
      }
      if (pointerRef.current.movingPattern) {
        const proposedDx = Math.floor(point.gridX) - pointerRef.current.moveStartCellX;
        const proposedDy = Math.floor(point.gridY) - pointerRef.current.moveStartCellY;
        const originCells = pointerRef.current.moveOriginCells.length > 0 ? pointerRef.current.moveOriginCells : draftCellsRef.current;
        const { dx, dy } = clampShiftDelta(originCells, project.width, project.height, proposedDx, proposedDy, pointerRef.current.moveSelectionIndices);
        if (
          pointerRef.current.moveSelectionIndices.length > 0 &&
          !canShiftSelection(originCells, project.width, project.height, dx, dy, pointerRef.current.moveSelectionIndices)
        ) {
          return;
        }
        if (dx !== pointerRef.current.moveLastDx || dy !== pointerRef.current.moveLastDy) {
          pointerRef.current.moveLastDx = dx;
          pointerRef.current.moveLastDy = dy;
          onCellsChange(shiftCells(originCells, project.width, project.height, dx, dy, pointerRef.current.moveSelectionIndices));
        }
        return;
      }
      if (tool === 'eraser' && !pointerRef.current.singleCellErasing) {
        drawBrushLine(pointerRef.current.lastGridX, pointerRef.current.lastGridY, point.gridX, point.gridY);
        pointerRef.current.lastGridX = point.gridX;
        pointerRef.current.lastGridY = point.gridY;
        if (cell) {
          pointerRef.current.lastCellX = cell.x;
          pointerRef.current.lastCellY = cell.y;
        }
        return;
      }
      if (cell) {
        drawLine(
          pointerRef.current.lastCellX,
          pointerRef.current.lastCellY,
          cell.x,
          cell.y,
          pointerRef.current.lastGridX,
          pointerRef.current.lastGridY,
          point.gridX,
          point.gridY,
        );
        pointerRef.current.lastCellX = cell.x;
        pointerRef.current.lastCellY = cell.y;
        pointerRef.current.lastGridX = point.gridX;
        pointerRef.current.lastGridY = point.gridY;
      }
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current.shaping) {
      const draft = shapeDraft ?? {
        kind: shapeKind,
        fillMode: shapeFillMode,
        arrowKind,
        start: { x: pointerRef.current.shapeStartCellX, y: pointerRef.current.shapeStartCellY },
        end: { x: pointerRef.current.shapeLastCellX, y: pointerRef.current.shapeLastCellY },
      };
      const next = draftCellsRef.current.slice();
      collectShapeIndices(draft.kind, draft.fillMode, draft.arrowKind, draft.start, draft.end, project.width, project.height).forEach((index) => {
        next[index] = selectedColorId;
      });
      draftCellsRef.current = next;
      onCellsChange(next);
    }
    pointerRef.current.drawing = false;
    pointerRef.current.panning = false;
    pointerRef.current.erasing = false;
    pointerRef.current.singleCellErasing = false;
    pointerRef.current.movingPattern = false;
    pointerRef.current.draggingReference = false;
    pointerRef.current.copySelecting = false;
    pointerRef.current.shaping = false;
    pointerRef.current.moveOriginCells = [];
    pointerRef.current.moveSelectionIndices = [];
    pointerRef.current.copySelectionSet = new Set<number>();
    setShapeDraft(null);
    setActivePointerMode(null);
    event.currentTarget.releasePointerCapture(pointerRef.current.pointerId);
  }

  function handlePointerLeave() {
    setHoverPoint(null);
    onHover(null);
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    if (tool === 'text') {
      const nextSize = Math.min(72, Math.max(5, textToolSize + (event.deltaY > 0 ? -1 : 1)));
      if (nextSize !== textToolSize) onTextToolSizeChange(nextSize);
      return;
    }
    if (referenceImageAdjusting && referenceImageVisible) {
      const nextScale = Math.min(3, Math.max(0.25, referenceImageScale * (event.deltaY > 0 ? 0.94 : 1.06)));
      onReferenceScaleChange(nextScale);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const before = screenToWorld(point.x, point.y);
    const nextZoom = Math.min(5, Math.max(0.12, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
    setZoom(nextZoom);
    setPan(constrainPan({
      x: point.x - before.x * nextZoom,
      y: point.y - before.y * nextZoom,
    }, nextZoom));
  }

  function fitToWindow() {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const availableWidth = wrapper.clientWidth - 88;
    const availableHeight = wrapper.clientHeight - 88;
    const patternWidth = project.width * cellSize;
    const patternHeight = project.height * cellSize;
    const nextZoom = Math.min(2.4, Math.max(0.12, Math.min(availableWidth / patternWidth, availableHeight / patternHeight)));
    setZoom(nextZoom);
    setPan({
      x: (wrapper.clientWidth - patternWidth * nextZoom) / 2,
      y: (wrapper.clientHeight - patternHeight * nextZoom) / 2,
    });
  }

  function stepZoom(multiplier: number) {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const point = { x: wrapper.clientWidth / 2, y: wrapper.clientHeight / 2 };
    const before = screenToWorld(point.x, point.y);
    const nextZoom = Math.min(5, Math.max(0.12, zoom * multiplier));
    setZoom(nextZoom);
    setPan(constrainPan({
      x: point.x - before.x * nextZoom,
      y: point.y - before.y * nextZoom,
    }, nextZoom));
  }

  function constrainPan(nextPan: { x: number; y: number }, nextZoom: number): { x: number; y: number } {
    const wrapper = wrapperRef.current;
    if (!wrapper) return nextPan;
    const boardWidth = project.width * cellSize * nextZoom;
    const boardHeight = project.height * cellSize * nextZoom;
    const clampAxis = (value: number, viewportSize: number, contentSize: number) => {
      const visibleGuard = Math.max(32, Math.min(120, viewportSize * 0.36, contentSize * 0.55));
      const min = visibleGuard - contentSize;
      const max = viewportSize - visibleGuard;
      if (min > max) return (viewportSize - contentSize) / 2;
      return Math.min(max, Math.max(min, value));
    };
    return {
      x: clampAxis(nextPan.x, wrapper.clientWidth, boardWidth),
      y: clampAxis(nextPan.y, wrapper.clientHeight, boardHeight),
    };
  }

  function almostSamePoint(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  }

  function applyTool(x: number, y: number, gridX = x + 0.5, gridY = y + 0.5) {
    const next = draftCellsRef.current.slice();
    const value = pointerRef.current.erasing || tool === 'eraser' ? null : selectedColorId;
    if (value === null && !pointerRef.current.singleCellErasing) {
      applyBrush(next, gridX, gridY, eraserSize, null, project.width, project.height);
    } else {
      next[y * project.width + x] = value;
    }
    draftCellsRef.current = next;
    onCellsChange(next);
  }

  function applyCopySelection(points: Array<{ x: number; y: number }>) {
    const activeCells = getActiveLayerCells(project);
    const selected = pointerRef.current.copySelectionSet;
    let changed = false;
    points.forEach(({ x, y }) => {
      if (x < 0 || y < 0 || x >= project.width || y >= project.height) return;
      const index = y * project.width + x;
      if (!activeCells[index]) return;
      if (pointerRef.current.copySelectionAction === 'add') {
        if (!selected.has(index)) {
          selected.add(index);
          changed = true;
        }
      } else if (selected.delete(index)) {
        changed = true;
      }
    });
    if (!changed) return;
    const indices = [...selected].filter((index) => Boolean(activeCells[index]));
    const pattern = indices.length > 0 ? createClipboardPattern(activeCells, project.width, indices) : null;
    onCopySelectionChange(indices, pattern);
  }

  function drawLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fromGridX = fromX + 0.5,
    fromGridY = fromY + 0.5,
    toGridX = toX + 0.5,
    toGridY = toY + 0.5,
  ) {
    const dx = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);
    const gridDx = Math.abs(toGridX - fromGridX);
    const gridDy = Math.abs(toGridY - fromGridY);
    const steps = Math.max(dx, dy, Math.ceil(Math.max(gridDx, gridDy) * 2), 1);
    let next = draftCellsRef.current.slice();
    const value = pointerRef.current.erasing || tool === 'eraser' ? null : selectedColorId;
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(fromX + ((toX - fromX) * step) / steps);
      const y = Math.round(fromY + ((toY - fromY) * step) / steps);
      if (value === null && !pointerRef.current.singleCellErasing) {
        const gridX = fromGridX + ((toGridX - fromGridX) * step) / steps;
        const gridY = fromGridY + ((toGridY - fromGridY) * step) / steps;
        applyBrush(next, gridX, gridY, eraserSize, null, project.width, project.height);
      } else {
        next[y * project.width + x] = value;
      }
    }
    draftCellsRef.current = next;
    onCellsChange(next);
  }

  function drawBrushLine(fromGridX: number, fromGridY: number, toGridX: number, toGridY: number) {
    const dx = Math.abs(toGridX - fromGridX);
    const dy = Math.abs(toGridY - fromGridY);
    const steps = Math.max(Math.ceil(Math.max(dx, dy) * 3), 1);
    const next = draftCellsRef.current.slice();
    for (let step = 0; step <= steps; step += 1) {
      const gridX = fromGridX + ((toGridX - fromGridX) * step) / steps;
      const gridY = fromGridY + ((toGridY - fromGridY) * step) / steps;
      applyBrush(next, gridX, gridY, eraserSize, null, project.width, project.height);
    }
    draftCellsRef.current = next;
    onCellsChange(next);
  }

  function canvasToGridPoint(clientX: number, clientY: number, allowOutside = false): PointerGridPoint | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const world = screenToWorld(clientX - rect.left, clientY - rect.top);
    const gridX = world.x / cellSize;
    const gridY = world.y / cellSize;
    const x = Math.floor(gridX);
    const y = Math.floor(gridY);
    const cell = x < 0 || y < 0 || x >= project.width || y >= project.height ? null : { x, y };
    if (!allowOutside && !cell && (gridX < -eraserSize || gridY < -eraserSize || gridX > project.width + eraserSize || gridY > project.height + eraserSize)) {
      return null;
    }
    return { cell, gridX, gridY };
  }

  function screenToWorld(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - pan.x) / zoom,
      y: (y - pan.y) / zoom,
    };
  }

  const canvasTool = activePointerMode === 'rightErase' ? 'eraser' : activePointerMode === 'pan' || activePointerMode === 'reference' || isSpaceDown ? 'pan' : activePointerMode === 'move' ? 'move' : activePointerMode === 'shape' ? 'shape' : tool;
  const canvasClassName = [
    'canvas',
    activePointerMode === 'pan' ? 'is-panning' : '',
    referenceImageAdjusting && referenceImageVisible ? 'is-reference-adjusting' : '',
    activePointerMode === 'move' ? 'is-moving' : '',
    isSpaceDown ? 'can-pan' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="workspace" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className={canvasClassName}
        data-tool={canvasTool}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      />
      <div className="board-chip">
        {project.width} * {project.height}
      </div>
      {!canEdit && <div className="canvas-lock-hint">{lockedHint}</div>}
      {referenceImageAdjusting && referenceImageVisible && (
        <div className="reference-adjust-hint">{referenceAdjustHint}</div>
      )}
      <div className="zoom-controls" aria-label="Canvas zoom controls">
        <button onClick={() => stepZoom(0.9)}>-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => stepZoom(1.1)}>+</button>
        <button onClick={fitToWindow}>{fitLabel}</button>
      </div>
    </div>
  );
}

function drawPattern(
  context: CanvasRenderingContext2D,
  project: BeadProject,
  cellSize: number,
  zoom: number,
  pan: { x: number; y: number },
  highlightedColorId: string | null,
  highlightedCellIndices: number[],
  tool: ToolId,
  selectedColorId: string,
  eraserSize: number,
  moveMode: MoveMode,
  removeMode: RemoveMode,
  mirrorMode: MoveMode,
  clipboardPattern: ClipboardPattern | null,
  copyMode: CopyMode,
  copySelectionIndices: number[],
  shapeDraft: ShapeDraft | null,
  hoverPoint: PointerGridPoint | null,
  canEdit: boolean,
  referenceImage: ReferenceImageRenderOptions,
  textToolValue: string,
  textToolDirection: TextDirection,
  textToolSize: number,
  textToolSpacing: number,
  formatColorCode?: (colorId: string) => string,
): void {
  const canvasWidth = context.canvas.width / (window.devicePixelRatio || 1);
  const canvasHeight = context.canvas.height / (window.devicePixelRatio || 1);
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = '#f3f0e8';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.save();
  context.translate(pan.x, pan.y);
  context.scale(zoom, zoom);
  context.fillStyle = '#fffdf7';
  context.fillRect(0, 0, project.width * cellSize, project.height * cellSize);
  const visibleLayers = (project.layers ?? []).filter((layer) => layer.visible);
  const highlightedCells = highlightedCellIndices.length > 0 ? new Set(highlightedCellIndices) : null;
  if (referenceImage.visible && referenceImage.placement === 'below') {
    drawReferenceImage(context, project, cellSize, referenceImage);
  }

  for (let y = 0; y < project.height; y += 1) {
    for (let x = 0; x < project.width; x += 1) {
      const index = y * project.width + x;
      const stack = visibleLayers
        .map((layer) => ({ layer, colorId: layer.cells?.[index] }))
        .filter((item): item is { layer: BeadLayer; colorId: string } => Boolean(item.colorId));
      const topColorId = stack.length > 0 ? stack[stack.length - 1].colorId : null;
      const topColor = getColor(topColorId);
      const left = x * cellSize;
      const top = y * cellSize;

      if (project.settings.beadDisplayMode === 'bead') {
        drawBeadStack(context, stack, left, top, cellSize);
      } else if (topColor) {
        context.fillStyle = topColor.hex;
        context.fillRect(left, top, cellSize, cellSize);
      }

      if (stack.length > 1 && project.settings.showLayerOverlap) {
        drawStackOverlay(context, stack, left, top, cellSize);
      }

      if (highlightedColorId && topColorId !== highlightedColorId) {
        context.fillStyle = 'rgba(255, 255, 255, 0.72)';
        context.fillRect(left, top, cellSize, cellSize);
      }

      if (highlightedCells?.has(index) && topColorId) {
        drawCellAlert(context, left, top, cellSize);
      }

      if (project.settings.showColorCodes && topColor && cellSize >= 16) {
        context.fillStyle = readableTextColor(topColor.rgb);
        context.font = `${Math.max(7, cellSize * 0.3)}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(formatColorCode?.(topColor.id) ?? topColor.primaryCode, left + cellSize / 2, top + cellSize / 2);
      }
    }
  }

  if (referenceImage.visible && referenceImage.placement === 'above') {
    drawReferenceImage(context, project, cellSize, referenceImage);
  }

  if (tool === 'copy' && copyMode === 'selection' && copySelectionIndices.length > 0) {
    drawCopySelectionSet(context, copySelectionIndices, project.width, cellSize);
  }
  if (hoverPoint && (canEdit || tool === 'eyedropper' || tool === 'copy')) {
    drawToolImpactPreview(context, project, tool, selectedColorId, hoverPoint, eraserSize, moveMode, removeMode, mirrorMode, clipboardPattern, copyMode, copySelectionIndices, textToolValue, textToolDirection, textToolSize, textToolSpacing, cellSize);
  }
  if (shapeDraft && canEdit) {
    const indices = collectShapeIndices(shapeDraft.kind, shapeDraft.fillMode, shapeDraft.arrowKind, shapeDraft.start, shapeDraft.end, project.width, project.height);
    drawShapePreview(context, indices, project.width, cellSize, selectedColorId);
  } else if (tool === 'shape' && hoverPoint?.cell && canEdit) {
    const index = hoverPoint.cell.y * project.width + hoverPoint.cell.x;
    drawShapePreview(context, [index], project.width, cellSize, selectedColorId);
  }
  if (project.settings.showGrid) drawGrid(context, project, cellSize);
  if (project.settings.showPegboardBoundaries) drawPegboardBoundaries(context, project, cellSize);
  if (project.settings.showCoordinates && cellSize * zoom > 10) drawCoordinates(context, project, cellSize);
  if (tool === 'eraser' && hoverPoint && canEdit && eraserSize > 0) {
    drawBrushCursor(context, hoverPoint.gridX, hoverPoint.gridY, eraserSize, cellSize);
  }
  context.restore();
}

function applyBrush(
  cells: Array<string | null>,
  centerX: number,
  centerY: number,
  size: number,
  value: string | null,
  width: number,
  height: number,
): void {
  if (size <= 0.5) {
    const x = Math.floor(centerX);
    const y = Math.floor(centerY);
    if (x >= 0 && y >= 0 && x < width && y < height) cells[y * width + x] = value;
    return;
  }
  const diameter = Math.max(1, Math.round(size));
  const radius = diameter / 2;
  const minX = Math.max(0, Math.floor(centerX - radius - 0.5));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius - 0.5));
  const minY = Math.max(0, Math.floor(centerY - radius - 0.5));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius - 0.5));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (circleIntersectsCell(centerX, centerY, radius, x, y)) {
        cells[y * width + x] = value;
      }
    }
  }
}

function drawBrushCursor(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  cellSize: number,
): void {
  const diameter = Math.max(0.25, size);
  const radius = (diameter * cellSize) / 2;
  const x = centerX * cellSize;
  const y = centerY * cellSize;
  const visibleRadius = Math.max(2, radius);
  context.save();
  context.beginPath();
  context.arc(x, y, visibleRadius, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 255, 255, 0.12)';
  context.fill();
  context.lineWidth = Math.max(1, cellSize * 0.055);
  context.strokeStyle = 'rgba(17, 24, 39, 0.48)';
  context.setLineDash([cellSize * 0.22, cellSize * 0.18]);
  context.stroke();
  context.beginPath();
  context.arc(x, y, visibleRadius, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(255, 255, 255, 0.68)';
  context.lineWidth = Math.max(0.6, cellSize * 0.025);
  context.setLineDash([]);
  context.stroke();
  context.restore();
}

function drawShapePreview(
  context: CanvasRenderingContext2D,
  indices: number[],
  width: number,
  cellSize: number,
  selectedColorId: string,
): void {
  if (indices.length === 0) return;
  const color = getColor(selectedColorId);
  context.save();
  if (color) {
    context.fillStyle = hexToRgba(color.hex, 0.32);
    indices.forEach((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      context.fillRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, cellSize - 4);
    });
  }
  drawCellBoundarySet(context, indices, width, cellSize);
  context.restore();
}

function drawClipboardPatternPreview(
  context: CanvasRenderingContext2D,
  pattern: ClipboardPattern,
  startX: number,
  startY: number,
  boardWidth: number,
  boardHeight: number,
  cellSize: number,
): void {
  const indices: number[] = [];
  context.save();
  pattern.cells.forEach((colorId, index) => {
    if (!colorId) return;
    const x = startX + (index % pattern.width);
    const y = startY + Math.floor(index / pattern.width);
    if (x < 0 || y < 0 || x >= boardWidth || y >= boardHeight) return;
    const color = getColor(colorId);
    if (color) {
      context.fillStyle = hexToRgba(color.hex, 0.34);
      context.fillRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, cellSize - 4);
    }
    indices.push(y * boardWidth + x);
  });
  drawCellBoundarySet(context, indices, boardWidth, cellSize);
  context.restore();
}

function collectShapeIndices(
  kind: ShapeKind,
  fillMode: ShapeFillMode,
  arrowKind: ArrowKind,
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number,
  height: number,
): number[] {
  const add = (points: Array<{ x: number; y: number }>) => uniqueInBounds(points, width, height);
  const squareEnd = constrainToSquare(start, end);
  if (kind === 'line') return add(linePoints(start.x, start.y, end.x, end.y));
  if (kind === 'rectangle') return add(fillMode === 'filled' ? filledRectanglePoints(start.x, start.y, end.x, end.y) : rectanglePoints(start.x, start.y, end.x, end.y));
  if (kind === 'square') return add(fillMode === 'filled' ? filledRectanglePoints(start.x, start.y, squareEnd.x, squareEnd.y) : rectanglePoints(start.x, start.y, squareEnd.x, squareEnd.y));
  if (kind === 'ellipse') return add(fillMode === 'filled' ? filledEllipsePoints(start.x, start.y, end.x, end.y) : ellipsePoints(start.x, start.y, end.x, end.y));
  if (kind === 'circle') return add(fillMode === 'filled' ? filledCirclePoints(start.x, start.y, squareEnd.x, squareEnd.y) : circlePoints(start.x, start.y, squareEnd.x, squareEnd.y));
  if (kind === 'triangle') return add(fillMode === 'filled' ? filledTrianglePoints(start.x, start.y, end.x, end.y) : trianglePoints(start.x, start.y, end.x, end.y));
  return add(arrowPoints(start.x, start.y, end.x, end.y, arrowKind));
}

function uniqueInBounds(points: Array<{ x: number; y: number }>, width: number, height: number): number[] {
  const seen = new Set<number>();
  points.forEach(({ x, y }) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    seen.add(y * width + x);
  });
  return [...seen];
}

type TextGlyph = {
  points: Array<{ x: number; y: number }>;
  width: number;
  height: number;
};

const textPatternCache = new Map<string, Array<{ x: number; y: number }>>();
const textGlyphCache = new Map<string, TextGlyph>();

function collectTextIndices(
  value: string,
  direction: TextDirection,
  size: number,
  spacing: number,
  startX: number,
  startY: number,
  width: number,
  height: number,
): number[] {
  const points = rasterizeTextPoints(value, direction, size, spacing).map((point) => ({
    x: startX + point.x,
    y: startY + point.y,
  }));
  return uniqueInBounds(points, width, height);
}

function rasterizeTextPoints(value: string, direction: TextDirection, size: number, spacing: number): Array<{ x: number; y: number }> {
  const text = value.trim().length > 0 ? value : 'ABC';
  const normalizedText = text.replace(/\r/g, '');
  const normalizedSpacing = Math.max(0, Math.round(spacing));
  const key = `${direction}:${size}:${normalizedSpacing}:${normalizedText}`;
  const cached = textPatternCache.get(key);
  if (cached) return cached;

  const points: Array<{ x: number; y: number }> = [];
  if (direction === 'vertical') {
    let yCursor = 0;
    Array.from(normalizedText.replace(/\n/g, '')).forEach((char) => {
      const glyph = rasterizeTextGlyph(char, size);
      glyph.points.forEach((point) => points.push({ x: point.x, y: yCursor + point.y }));
      yCursor += glyphVisibleHeight(glyph) + normalizedSpacing;
    });
  } else {
    let yCursor = 0;
    normalizedText.split('\n').forEach((line) => {
      let xCursor = 0;
      let lineHeight = size;
      Array.from(line.length > 0 ? line : ' ').forEach((char) => {
        const glyph = rasterizeTextGlyph(char, size);
        glyph.points.forEach((point) => points.push({ x: xCursor + point.x, y: yCursor + point.y }));
        xCursor += glyph.width + normalizedSpacing;
        lineHeight = Math.max(lineHeight, glyph.height);
      });
      yCursor += lineHeight + normalizedSpacing;
    });
  }

  if (textPatternCache.size > 80) textPatternCache.clear();
  textPatternCache.set(key, points);
  return points;
}

function rasterizeTextGlyph(char: string, size: number): TextGlyph {
  const normalizedSize = Math.max(5, Math.round(size));
  if (char === ' ') {
    return { points: [], width: Math.max(2, Math.round(normalizedSize * 0.45)), height: normalizedSize };
  }
  const key = `${normalizedSize}:${char}`;
  const cached = textGlyphCache.get(key);
  if (cached) return cached;
  const cellPixel = 5;
  const fontSize = Math.max(16, Math.round(normalizedSize * cellPixel));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return { points: [], width: normalizedSize, height: normalizedSize };

  const font = `500 ${fontSize}px Arial, "Microsoft YaHei", "PingFang SC", sans-serif`;
  context.font = font;
  const metrics = context.measureText(char);
  const padding = cellPixel * 3;
  canvas.width = Math.max(cellPixel * 2, Math.ceil(metrics.width + padding * 2));
  canvas.height = Math.max(cellPixel * 2, Math.ceil(fontSize * 1.32 + padding * 2));

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = font;
  context.fillStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText(char, padding, padding + fontSize);

  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const cols = Math.ceil(canvas.width / cellPixel);
  const rows = Math.ceil(canvas.height / cellPixel);
  const raw: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let alphaTotal = 0;
      let samples = 0;
      const fromX = col * cellPixel;
      const fromY = row * cellPixel;
      const toX = Math.min(canvas.width, fromX + cellPixel);
      const toY = Math.min(canvas.height, fromY + cellPixel);
      for (let y = fromY; y < toY; y += 1) {
        for (let x = fromX; x < toX; x += 1) {
          alphaTotal += data[(y * canvas.width + x) * 4 + 3];
          samples += 1;
        }
      }
      if (samples > 0 && alphaTotal / (samples * 255) > 0.3) raw.push({ x: col, y: row });
    }
  }

  if (raw.length === 0) {
    return { points: [], width: Math.max(1, Math.ceil(metrics.width / cellPixel)), height: normalizedSize };
  }
  const minX = Math.min(...raw.map((point) => point.x));
  const maxX = Math.max(...raw.map((point) => point.x));
  const lineTop = Math.max(0, Math.floor(padding / cellPixel));
  const points = raw
    .map((point) => ({ x: point.x - minX, y: point.y - lineTop }))
    .filter((point) => point.y >= 0);
  const glyphHeight = Math.max(normalizedSize + 2, ...points.map((point) => point.y + 1));
  const glyph = { points, width: maxX - minX + 1, height: glyphHeight };
  if (textGlyphCache.size > 160) textGlyphCache.clear();
  textGlyphCache.set(key, glyph);
  return glyph;
}

function glyphVisibleHeight(glyph: TextGlyph): number {
  if (glyph.points.length === 0) return glyph.height;
  const minY = Math.min(...glyph.points.map((point) => point.y));
  const maxY = Math.max(...glyph.points.map((point) => point.y));
  return Math.max(1, maxY - minY + 1);
}

function linePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const steps = Math.max(dx, dy, 1);
  for (let step = 0; step <= steps; step += 1) {
    points.push({
      x: Math.round(x0 + ((x1 - x0) * step) / steps),
      y: Math.round(y0 + ((y1 - y0) * step) / steps),
    });
  }
  return points;
}

function rectanglePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const points: Array<{ x: number; y: number }> = [];
  for (let x = minX; x <= maxX; x += 1) {
    points.push({ x, y: minY }, { x, y: maxY });
  }
  for (let y = minY + 1; y < maxY; y += 1) {
    points.push({ x: minX, y }, { x: maxX, y });
  }
  return points;
}

function filledRectanglePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const points: Array<{ x: number; y: number }> = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) points.push({ x, y });
  }
  return points;
}

function constrainToSquare(start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const size = Math.max(0, Math.min(Math.abs(dx), Math.abs(dy)));
  return {
    x: start.x + Math.sign(dx || 1) * size,
    y: start.y + Math.sign(dy || 1) * size,
  };
}

function ellipsePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 1 || height <= 1) return rectanglePoints(x0, y0, x1, y1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(1, Math.round(width / 2));
  const ry = Math.max(1, Math.round(height / 2));
  return midpointEllipsePoints(cx, cy, rx, ry);
}

function circlePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const size = Math.min(maxX - minX, maxY - minY);
  if (size <= 1) return rectanglePoints(x0, y0, x1, y1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const radius = Math.max(1, Math.round(size / 2));
  return midpointCirclePoints(cx, cy, radius);
}

function midpointCirclePoints(cx: number, cy: number, radius: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  let x = radius;
  let y = 0;
  let decision = 1 - radius;
  while (x >= y) {
    pushSymmetricCirclePoints(points, cx, cy, x, y);
    y += 1;
    if (decision < 0) {
      decision += 2 * y + 1;
    } else {
      x -= 1;
      decision += 2 * (y - x) + 1;
    }
  }
  return points;
}

function midpointEllipsePoints(cx: number, cy: number, rx: number, ry: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  let x = 0;
  let y = ry;
  let px = 0;
  let py = 2 * rx2 * y;
  let p = ry2 - rx2 * ry + 0.25 * rx2;

  while (px < py) {
    pushSymmetricEllipsePoints(points, cx, cy, x, y);
    x += 1;
    px += 2 * ry2;
    if (p < 0) {
      p += ry2 + px;
    } else {
      y -= 1;
      py -= 2 * rx2;
      p += ry2 + px - py;
    }
  }

  p = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y >= 0) {
    pushSymmetricEllipsePoints(points, cx, cy, x, y);
    y -= 1;
    py -= 2 * rx2;
    if (p > 0) {
      p += rx2 - py;
    } else {
      x += 1;
      px += 2 * ry2;
      p += rx2 - py + px;
    }
  }

  return points;
}

function pushSymmetricCirclePoints(points: Array<{ x: number; y: number }>, cx: number, cy: number, x: number, y: number): void {
  points.push(
    { x: Math.round(cx + x), y: Math.round(cy + y) },
    { x: Math.round(cx + y), y: Math.round(cy + x) },
    { x: Math.round(cx - y), y: Math.round(cy + x) },
    { x: Math.round(cx - x), y: Math.round(cy + y) },
    { x: Math.round(cx - x), y: Math.round(cy - y) },
    { x: Math.round(cx - y), y: Math.round(cy - x) },
    { x: Math.round(cx + y), y: Math.round(cy - x) },
    { x: Math.round(cx + x), y: Math.round(cy - y) },
  );
}

function pushSymmetricEllipsePoints(points: Array<{ x: number; y: number }>, cx: number, cy: number, x: number, y: number): void {
  points.push(
    { x: Math.round(cx + x), y: Math.round(cy + y) },
    { x: Math.round(cx - x), y: Math.round(cy + y) },
    { x: Math.round(cx + x), y: Math.round(cy - y) },
    { x: Math.round(cx - x), y: Math.round(cy - y) },
  );
}

function filledEllipsePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 1 || height <= 1) return filledRectanglePoints(x0, y0, x1, y1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(0.5, width / 2);
  const ry = Math.max(0.5, height / 2);
  const points: Array<{ x: number; y: number }> = [];
  const edgeBias = 1.02;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= edgeBias) points.push({ x, y });
    }
  }
  return points;
}

function filledCirclePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const size = Math.min(maxX - minX, maxY - minY);
  if (size <= 1) return filledRectanglePoints(x0, y0, x1, y1);
  const cx = Math.round((minX + maxX) / 2);
  const cy = Math.round((minY + maxY) / 2);
  const radius = Math.max(1, Math.round(size / 2));
  const points: Array<{ x: number; y: number }> = [];
  const limit = (radius + 0.2) * (radius + 0.2);
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= limit) points.push({ x, y });
    }
  }
  return points;
}

function trianglePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const vertices = triangleVertices(x0, y0, x1, y1);
  return [...linePoints(vertices.apex.x, vertices.apex.y, vertices.left.x, vertices.left.y), ...linePoints(vertices.left.x, vertices.left.y, vertices.right.x, vertices.right.y), ...linePoints(vertices.right.x, vertices.right.y, vertices.apex.x, vertices.apex.y)];
}

function filledTrianglePoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const vertices = triangleVertices(x0, y0, x1, y1);
  return [...filledPolygonPoints([vertices.apex, vertices.left, vertices.right]), ...polygonEdgePoints([vertices.apex, vertices.left, vertices.right])];
}

function triangleVertices(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { apex: { x: number; y: number }; left: { x: number; y: number }; right: { x: number; y: number } } {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const width = maxX - minX;
  const centerX = minX + Math.round(width / 2);
  return {
    apex: { x: centerX, y: minY },
    left: { x: minX, y: maxY },
    right: { x: maxX, y: maxY },
  };
}

function arrowPoints(x0: number, y0: number, x1: number, y1: number, arrowKind: ArrowKind): Array<{ x: number; y: number }> {
  if (arrowKind === 'block') return blockArrowPoints(x0, y0, x1, y1);
  const stair = stairArrowPoints(x0, y0, x1, y1, arrowKind);
  if (stair) return stair;
  const shaft = linePoints(x0, y0, x1, y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const headLength = Math.max(2, Math.min(6, Math.round(length * 0.32)));
  const wing = Math.max(1, Math.round(headLength * 0.65));
  const baseX = Math.round(x1 - ux * headLength);
  const baseY = Math.round(y1 - uy * headLength);
  const perpX = -uy;
  const perpY = ux;
  return [
    ...shaft,
    ...linePoints(x1, y1, Math.round(baseX + perpX * wing), Math.round(baseY + perpY * wing)),
    ...linePoints(x1, y1, Math.round(baseX - perpX * wing), Math.round(baseY - perpY * wing)),
    ...(arrowKind === 'double'
      ? [
          ...linePoints(x0, y0, Math.round(x0 + ux * headLength + perpX * wing), Math.round(y0 + uy * headLength + perpY * wing)),
          ...linePoints(x0, y0, Math.round(x0 + ux * headLength - perpX * wing), Math.round(y0 + uy * headLength - perpY * wing)),
        ]
      : []),
  ];
}

function stairArrowPoints(x0: number, y0: number, x1: number, y1: number, arrowKind: ArrowKind): Array<{ x: number; y: number }> | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  if (length < 3) return null;
  const headSize = Math.max(2, Math.min(7, Math.round(length * 0.28)));
  if (Math.abs(dx) >= Math.abs(dy) * 2) {
    const dir = Math.sign(dx || 1);
    const centerY = Math.round((y0 + y1) / 2);
    const tipX = x1;
    const shaftStart = arrowKind === 'double' ? x0 + dir * headSize : x0;
    const shaftEnd = x1;
    const points = linePoints(shaftStart, centerY, shaftEnd, centerY);
    points.push(...stairArrowHeadPoints(tipX, centerY, dir, 0, headSize));
    if (arrowKind === 'double') points.push(...stairArrowHeadPoints(x0, centerY, -dir, 0, headSize));
    return points;
  }
  if (Math.abs(dy) >= Math.abs(dx) * 2) {
    const dir = Math.sign(dy || 1);
    const centerX = Math.round((x0 + x1) / 2);
    const tipY = y1;
    const shaftStart = arrowKind === 'double' ? y0 + dir * headSize : y0;
    const shaftEnd = y1;
    const points = linePoints(centerX, shaftStart, centerX, shaftEnd);
    points.push(...stairArrowHeadPoints(centerX, tipY, 0, dir, headSize));
    if (arrowKind === 'double') points.push(...stairArrowHeadPoints(centerX, y0, 0, -dir, headSize));
    return points;
  }
  return null;
}

function stairArrowHeadPoints(tipX: number, tipY: number, dirX: number, dirY: number, size: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let step = 0; step <= size; step += 1) {
    if (dirX !== 0) {
      points.push({ x: tipX - dirX * step, y: tipY - step }, { x: tipX - dirX * step, y: tipY + step });
    } else {
      points.push({ x: tipX - step, y: tipY - dirY * step }, { x: tipX + step, y: tipY - dirY * step });
    }
  }
  return points;
}

function blockArrowPoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const cardinal = cardinalBlockArrowPoints(x0, y0, x1, y1);
  if (cardinal) return cardinal;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const perpX = -uy;
  const perpY = ux;
  const thickness = Math.max(1, Math.round(length * 0.12));
  const headLength = Math.max(2, Math.min(8, Math.round(length * 0.34)));
  const headWidth = Math.max(thickness + 1, Math.round(length * 0.26));
  const shaftEnd = {
    x: x1 - ux * headLength,
    y: y1 - uy * headLength,
  };
  const shaft = [
    { x: x0 + perpX * thickness, y: y0 + perpY * thickness },
    { x: shaftEnd.x + perpX * thickness, y: shaftEnd.y + perpY * thickness },
    { x: shaftEnd.x - perpX * thickness, y: shaftEnd.y - perpY * thickness },
    { x: x0 - perpX * thickness, y: y0 - perpY * thickness },
  ];
  const head = [
    { x: x1, y: y1 },
    { x: shaftEnd.x + perpX * headWidth, y: shaftEnd.y + perpY * headWidth },
    { x: shaftEnd.x - perpX * headWidth, y: shaftEnd.y - perpY * headWidth },
  ];
  return [...filledPolygonPoints(shaft), ...filledPolygonPoints(head), ...polygonEdgePoints(shaft), ...polygonEdgePoints(head)];
}

function cardinalBlockArrowPoints(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  if (length < 4) return null;
  const thickness = Math.max(1, Math.round(length * 0.12));
  const headSize = Math.max(thickness + 2, Math.min(9, Math.round(length * 0.28)));
  const points: Array<{ x: number; y: number }> = [];
  if (Math.abs(dx) >= Math.abs(dy) * 2) {
    const dir = Math.sign(dx || 1);
    const centerY = Math.round((y0 + y1) / 2);
    const shaftEnd = x1 - dir * headSize;
    for (let y = centerY - thickness; y <= centerY + thickness; y += 1) {
      const from = Math.min(x0, shaftEnd);
      const to = Math.max(x0, shaftEnd);
      for (let x = from; x <= to; x += 1) points.push({ x, y });
    }
    for (let offset = -headSize; offset <= headSize; offset += 1) {
      const baseX = x1 - dir * headSize;
      const edgeX = x1 - dir * Math.abs(offset);
      const from = Math.min(baseX, edgeX);
      const to = Math.max(baseX, edgeX);
      for (let x = from; x <= to; x += 1) points.push({ x, y: centerY + offset });
    }
    return points;
  }
  if (Math.abs(dy) >= Math.abs(dx) * 2) {
    const dir = Math.sign(dy || 1);
    const centerX = Math.round((x0 + x1) / 2);
    const shaftEnd = y1 - dir * headSize;
    for (let x = centerX - thickness; x <= centerX + thickness; x += 1) {
      const from = Math.min(y0, shaftEnd);
      const to = Math.max(y0, shaftEnd);
      for (let y = from; y <= to; y += 1) points.push({ x, y });
    }
    for (let offset = -headSize; offset <= headSize; offset += 1) {
      const baseY = y1 - dir * headSize;
      const edgeY = y1 - dir * Math.abs(offset);
      const from = Math.min(baseY, edgeY);
      const to = Math.max(baseY, edgeY);
      for (let y = from; y <= to; y += 1) points.push({ x: centerX + offset, y });
    }
    return points;
  }
  return null;
}

function filledPolygonPoints(vertices: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const minX = Math.floor(Math.min(...vertices.map((point) => point.x)));
  const maxX = Math.ceil(Math.max(...vertices.map((point) => point.x)));
  const minY = Math.floor(Math.min(...vertices.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...vertices.map((point) => point.y)));
  const points: Array<{ x: number; y: number }> = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x, y, vertices)) points.push({ x, y });
    }
  }
  return points;
}

function polygonEdgePoints(vertices: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  vertices.forEach((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    points.push(...linePoints(Math.round(point.x), Math.round(point.y), Math.round(next.x), Math.round(next.y)));
  });
  return points;
}

function pointInPolygon(x: number, y: number, vertices: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const a = vertices[i];
    const b = vertices[j];
    const intersects = a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawToolImpactPreview(
  context: CanvasRenderingContext2D,
  project: BeadProject,
  tool: ToolId,
  selectedColorId: string,
  hoverPoint: PointerGridPoint,
  eraserSize: number,
  moveMode: MoveMode,
  removeMode: RemoveMode,
  mirrorMode: MoveMode,
  clipboardPattern: ClipboardPattern | null,
  copyMode: CopyMode,
  copySelectionIndices: number[],
  textToolValue: string,
  textToolDirection: TextDirection,
  textToolSize: number,
  textToolSpacing: number,
  cellSize: number,
): void {
  if (tool === 'eraser') {
    if (eraserSize <= 0) return;
    const indices = collectBrushIndices(hoverPoint.gridX, hoverPoint.gridY, eraserSize, project.width, project.height);
    drawCellSet(context, indices, project.width, cellSize, {
      fill: 'rgba(185, 58, 50, 0.08)',
      stroke: 'rgba(185, 58, 50, 0.42)',
      lineWidth: 1,
    });
    return;
  }

  if (tool === 'fill') {
    if (!hoverPoint.cell) return;
    const indices = collectFloodFillIndices(
      getActiveLayerCells(project),
      project.width,
      project.height,
      hoverPoint.cell.x,
      hoverPoint.cell.y,
      selectedColorId,
    );
    drawCellSet(context, indices, project.width, cellSize, {
      fill: 'rgba(23, 101, 106, 0.06)',
      stroke: 'rgba(23, 101, 106, 0.34)',
      lineWidth: 1,
    });
    return;
  }

  if (tool === 'remove') {
    if (!hoverPoint.cell) return;
    const cells = getActiveLayerCells(project);
    const startIndex = hoverPoint.cell.y * project.width + hoverPoint.cell.x;
    if (!cells[startIndex]) return;
    const indices =
      removeMode === 'same-connected'
        ? collectConnectedCellIndices(cells, project.width, project.height, hoverPoint.cell.x, hoverPoint.cell.y)
        : removeMode === 'all-same-color'
          ? collectSameColorIndices(cells, hoverPoint.cell.x, hoverPoint.cell.y, project.width)
          : collectConnectedOccupiedIndices(cells, project.width, project.height, hoverPoint.cell.x, hoverPoint.cell.y);
    drawCellSet(context, indices, project.width, cellSize, {
      fill: 'rgba(185, 58, 50, 0.065)',
      stroke: 'rgba(185, 58, 50, 0.34)',
      lineWidth: 1,
    });
    return;
  }

  if (tool === 'move') {
    if (!hoverPoint.cell) return;
    const cells = getActiveLayerCells(project);
    const startIndex = hoverPoint.cell.y * project.width + hoverPoint.cell.x;
    if (!cells[startIndex]) return;
    const indices =
      moveMode === 'partial'
        ? collectConnectedOccupiedIndices(cells, project.width, project.height, hoverPoint.cell.x, hoverPoint.cell.y)
        : cells.flatMap((colorId, index) => (colorId ? [index] : []));
    drawCellBoundarySet(context, indices, project.width, cellSize);
    return;
  }

  if (tool === 'copy') {
    if (!hoverPoint.cell) return;
    const cells = getActiveLayerCells(project);
    const startIndex = hoverPoint.cell.y * project.width + hoverPoint.cell.x;
    if (!cells[startIndex]) return;
    if (copyMode === 'selection') {
      if (copySelectionIndices.includes(startIndex)) return;
      drawCopySelectionSet(context, [startIndex], project.width, cellSize, 0.7);
      return;
    }
    const indices = collectConnectedOccupiedIndices(cells, project.width, project.height, hoverPoint.cell.x, hoverPoint.cell.y);
    drawCellBoundarySet(context, indices, project.width, cellSize);
    return;
  }

  if (tool === 'paste') {
    if (!hoverPoint.cell || !clipboardPattern) return;
    drawClipboardPatternPreview(context, clipboardPattern, hoverPoint.cell.x, hoverPoint.cell.y, project.width, project.height, cellSize);
    return;
  }

  if (tool === 'mirror') {
    if (!hoverPoint.cell) return;
    const cells = getActiveLayerCells(project);
    const startIndex = hoverPoint.cell.y * project.width + hoverPoint.cell.x;
    if (!cells[startIndex]) return;
    const indices =
      mirrorMode === 'partial'
        ? collectConnectedOccupiedIndices(cells, project.width, project.height, hoverPoint.cell.x, hoverPoint.cell.y)
        : cells.flatMap((colorId, index) => (colorId ? [index] : []));
    drawCellBoundarySet(context, indices, project.width, cellSize);
    return;
  }

  if (tool === 'recolor') {
    if (!hoverPoint.cell) return;
    const sourceColorId = getTopVisibleColor(project, hoverPoint.cell.y * project.width + hoverPoint.cell.x);
    if (!sourceColorId || sourceColorId === selectedColorId) return;
    const indices = collectRecolorIndices(project, sourceColorId);
    drawCellSet(context, indices, project.width, cellSize, {
      fill: 'rgba(240, 200, 75, 0.18)',
      stroke: 'rgba(23, 101, 106, 0.74)',
      lineWidth: 1.55,
    });
    return;
  }

  if (tool === 'text') {
    if (!hoverPoint.cell) return;
    const indices = collectTextIndices(textToolValue, textToolDirection, textToolSize, textToolSpacing, hoverPoint.cell.x, hoverPoint.cell.y, project.width, project.height);
    drawShapePreview(context, indices, project.width, cellSize, selectedColorId);
    return;
  }

  if (tool === 'pencil') return;

  if (tool !== 'eyedropper' || !hoverPoint.cell) return;
  drawCellSet(context, [hoverPoint.cell.y * project.width + hoverPoint.cell.x], project.width, cellSize, {
    stroke: 'rgba(90, 78, 38, 0.62)',
    lineWidth: 1.2,
  });
}

function drawCellBoundarySet(
  context: CanvasRenderingContext2D,
  indices: number[],
  width: number,
  cellSize: number,
): void {
  if (indices.length === 0) return;
  const selected = new Set(indices);
  context.save();
  context.fillStyle = 'rgba(23, 101, 106, 0.045)';
  indices.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    context.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
  });
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  context.lineWidth = Math.max(2.4, cellSize * 0.16);
  context.lineCap = 'square';
  context.lineJoin = 'miter';
  strokeCellBoundary(context, indices, selected, width, cellSize);
  context.strokeStyle = 'rgba(23, 101, 106, 0.92)';
  context.lineWidth = Math.max(1.2, cellSize * 0.075);
  strokeCellBoundary(context, indices, selected, width, cellSize);
  context.restore();
}

function drawCopySelectionSet(
  context: CanvasRenderingContext2D,
  indices: number[],
  width: number,
  cellSize: number,
  alpha = 1,
): void {
  if (indices.length === 0) return;
  context.save();
  indices.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const centerX = x * cellSize + cellSize / 2;
    const centerY = y * cellSize + cellSize / 2;
    const radius = cellSize * 0.39;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(23, 101, 106, ${0.16 * alpha})`;
    context.fill();
    context.lineWidth = Math.max(2.2, cellSize * 0.13);
    context.strokeStyle = `rgba(255, 255, 255, ${0.92 * alpha})`;
    context.stroke();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.lineWidth = Math.max(1.25, cellSize * 0.075);
    context.strokeStyle = `rgba(23, 101, 106, ${0.96 * alpha})`;
    context.stroke();
    context.beginPath();
    context.arc(centerX, centerY, Math.max(1.8, cellSize * 0.12), 0, Math.PI * 2);
    context.fillStyle = `rgba(23, 101, 106, ${0.9 * alpha})`;
    context.fill();
  });
  context.restore();
}

function strokeCellBoundary(
  context: CanvasRenderingContext2D,
  indices: number[],
  selected: Set<number>,
  width: number,
  cellSize: number,
): void {
  indices.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const left = x * cellSize;
    const top = y * cellSize;
    const right = left + cellSize;
    const bottom = top + cellSize;
    const topNeighbor = index - width;
    const bottomNeighbor = index + width;
    const leftNeighbor = x > 0 ? index - 1 : -1;
    const rightNeighbor = x < width - 1 ? index + 1 : -1;
    if (!selected.has(topNeighbor)) {
      context.beginPath();
      context.moveTo(left, top);
      context.lineTo(right, top);
      context.stroke();
    }
    if (!selected.has(rightNeighbor)) {
      context.beginPath();
      context.moveTo(right, top);
      context.lineTo(right, bottom);
      context.stroke();
    }
    if (!selected.has(bottomNeighbor)) {
      context.beginPath();
      context.moveTo(left, bottom);
      context.lineTo(right, bottom);
      context.stroke();
    }
    if (!selected.has(leftNeighbor)) {
      context.beginPath();
      context.moveTo(left, top);
      context.lineTo(left, bottom);
      context.stroke();
    }
  });
}

function drawCellSet(
  context: CanvasRenderingContext2D,
  indices: number[],
  width: number,
  cellSize: number,
  style: { fill?: string; stroke: string; lineWidth: number },
): void {
  if (indices.length === 0) return;
  context.save();
  if (style.fill) context.fillStyle = style.fill;
  context.strokeStyle = style.stroke;
  context.lineWidth = style.lineWidth;
  indices.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const left = x * cellSize;
    const top = y * cellSize;
    if (style.fill) context.fillRect(left + 1, top + 1, cellSize - 2, cellSize - 2);
    context.strokeRect(left + 1.5, top + 1.5, cellSize - 3, cellSize - 3);
  });
  context.restore();
}

function collectRecolorIndices(project: BeadProject, sourceColorId: string): number[] {
  const indices = new Set<number>();
  (project.layers ?? []).forEach((layer) => {
    if (!layer.visible || layer.locked) return;
    layer.cells.forEach((colorId, index) => {
      if (colorId === sourceColorId) indices.add(index);
    });
  });
  return [...indices];
}

function collectBrushIndices(centerX: number, centerY: number, size: number, width: number, height: number): number[] {
  if (size <= 0.5) {
    const x = Math.floor(centerX);
    const y = Math.floor(centerY);
    return x >= 0 && y >= 0 && x < width && y < height ? [y * width + x] : [];
  }
  const diameter = Math.max(1, Math.round(size));
  const radius = diameter / 2;
  const minX = Math.max(0, Math.floor(centerX - radius - 0.5));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius - 0.5));
  const minY = Math.max(0, Math.floor(centerY - radius - 0.5));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius - 0.5));
  const indices: number[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (circleIntersectsCell(centerX, centerY, radius, x, y)) {
        indices.push(y * width + x);
      }
    }
  }
  return indices;
}

function circleIntersectsCell(centerX: number, centerY: number, radius: number, cellX: number, cellY: number): boolean {
  const activationInset = 0.3;
  const closestX = Math.max(cellX + activationInset, Math.min(cellX + 1 - activationInset, centerX));
  const closestY = Math.max(cellY + activationInset, Math.min(cellY + 1 - activationInset, centerY));
  const dx = closestX - centerX;
  const dy = closestY - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

function collectFloodFillIndices(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
  selectedColorId: string,
): number[] {
  const startIndex = y * width + x;
  const target = cells[startIndex];
  if (target === selectedColorId) return [startIndex];
  return collectConnectedCellIndices(cells, width, height, x, y);
}

function collectConnectedCellIndices(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
): number[] {
  const startIndex = y * width + x;
  const target = cells[startIndex];
  const seen = new Set<number>();
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number];
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const index = cy * width + cx;
    if (seen.has(index) || cells[index] !== target) continue;
    seen.add(index);
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return [...seen];
}

function collectSameColorIndices(
  cells: Array<string | null>,
  x: number,
  y: number,
  width: number,
): number[] {
  const target = cells[y * width + x];
  if (!target) return [];
  return cells.flatMap((colorId, index) => (colorId === target ? [index] : []));
}

function createClipboardPattern(cells: Array<string | null>, width: number, indices: number[]): ClipboardPattern {
  if (indices.length === 0) return { width: 0, height: 0, cells: [] };
  let minX = width;
  let maxX = -1;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = -1;
  indices.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const patternWidth = maxX - minX + 1;
  const patternHeight = maxY - minY + 1;
  const patternCells = Array<string | null>(patternWidth * patternHeight).fill(null);
  indices.forEach((index) => {
    const colorId = cells[index];
    if (!colorId) return;
    const x = index % width;
    const y = Math.floor(index / width);
    patternCells[(y - minY) * patternWidth + (x - minX)] = colorId;
  });
  return { width: patternWidth, height: patternHeight, cells: patternCells };
}

function pasteClipboardPattern(
  cells: Array<string | null>,
  width: number,
  height: number,
  pattern: ClipboardPattern,
  startX: number,
  startY: number,
): Array<string | null> {
  const next = cells.slice();
  pattern.cells.forEach((colorId, index) => {
    if (!colorId) return;
    const x = startX + (index % pattern.width);
    const y = startY + Math.floor(index / pattern.width);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    next[y * width + x] = colorId;
  });
  return next;
}

function shiftCells(
  cells: Array<string | null>,
  width: number,
  height: number,
  dx: number,
  dy: number,
  selectionIndices: number[] = [],
): Array<string | null> {
  if (dx === 0 && dy === 0) return cells.slice();
  const moveIndices = selectionIndices.length > 0 ? selectionIndices : cells.flatMap((colorId, index) => (colorId ? [index] : []));
  const next = selectionIndices.length > 0 ? cells.slice() : Array<string | null>(width * height).fill(null);
  if (selectionIndices.length > 0) {
    moveIndices.forEach((index) => {
      next[index] = null;
    });
  }
  moveIndices.forEach((index) => {
    const colorId = cells[index];
    if (!colorId) return;
    const x = index % width;
    const y = Math.floor(index / width);
    const nextX = x + dx;
    const nextY = y + dy;
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) return;
    next[nextY * width + nextX] = colorId;
  });
  return next;
}

function clampShiftDelta(
  cells: Array<string | null>,
  width: number,
  height: number,
  dx: number,
  dy: number,
  selectionIndices: number[] = [],
): { dx: number; dy: number } {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  const moveIndices = selectionIndices.length > 0 ? selectionIndices : cells.flatMap((colorId, index) => (colorId ? [index] : []));
  moveIndices.forEach((index) => {
    const colorId = cells[index];
    if (!colorId) return;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  if (maxX < 0 || maxY < 0) return { dx: 0, dy: 0 };
  return {
    dx: Math.min(width - 1 - maxX, Math.max(-minX, dx)),
    dy: Math.min(height - 1 - maxY, Math.max(-minY, dy)),
  };
}

function canShiftSelection(
  cells: Array<string | null>,
  width: number,
  height: number,
  dx: number,
  dy: number,
  selectionIndices: number[],
): boolean {
  const selected = new Set(selectionIndices);
  return selectionIndices.every((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const nextX = x + dx;
    const nextY = y + dy;
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) return false;
    const nextIndex = nextY * width + nextX;
    return selected.has(nextIndex) || !cells[nextIndex];
  });
}

function mirrorCells(
  cells: Array<string | null>,
  width: number,
  height: number,
  direction: MirrorDirection,
  selectionIndices: number[] = [],
): Array<string | null> {
  const moveIndices = selectionIndices.length > 0 ? selectionIndices : cells.flatMap((colorId, index) => (colorId ? [index] : []));
  if (moveIndices.length === 0) return cells;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  moveIndices.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const selected = new Set(moveIndices);
  const next = selectionIndices.length > 0 ? cells.slice() : Array<string | null>(width * height).fill(null);
  if (selectionIndices.length > 0) {
    const canMirror = moveIndices.every((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      const nextX = direction === 'horizontal' ? minX + maxX - x : x;
      const nextY = direction === 'vertical' ? minY + maxY - y : y;
      const nextIndex = nextY * width + nextX;
      return selected.has(nextIndex) || !cells[nextIndex];
    });
    if (!canMirror) return cells;
    moveIndices.forEach((index) => {
      next[index] = null;
    });
  }
  moveIndices.forEach((index) => {
    const colorId = cells[index];
    if (!colorId) return;
    const x = index % width;
    const y = Math.floor(index / width);
    const nextX = direction === 'horizontal' ? minX + maxX - x : x;
    const nextY = direction === 'vertical' ? minY + maxY - y : y;
    next[nextY * width + nextX] = colorId;
  });
  return next;
}

function collectConnectedOccupiedIndices(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
): number[] {
  const startIndex = y * width + x;
  if (!cells[startIndex]) return [];
  const seen = new Set<number>();
  const stack = [[x, y]];
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number];
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const index = cy * width + cx;
    if (seen.has(index) || !cells[index]) continue;
    seen.add(index);
    neighbors.forEach(([dx, dy]) => stack.push([cx + dx, cy + dy]));
  }
  return [...seen];
}

function drawReferenceImage(
  context: CanvasRenderingContext2D,
  project: BeadProject,
  cellSize: number,
  reference: ReferenceImageRenderOptions,
): void {
  if (!reference.image) return;
  const bounds = { x: 0, y: 0, width: project.width, height: project.height };
  if (bounds.width <= 0 || bounds.height <= 0) return;
  context.save();
  context.globalAlpha = Math.max(0.05, Math.min(0.9, reference.opacity));
  context.imageSmoothingEnabled = true;
  const scale = Math.max(0.25, Math.min(3, reference.scale));
  const imageWidth = reference.image.naturalWidth || reference.image.width;
  const imageHeight = reference.image.naturalHeight || reference.image.height;
  const imageRatio = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : bounds.width / bounds.height;
  const boundsRatio = bounds.width / bounds.height;
  const fitWidth = imageRatio >= boundsRatio ? bounds.width : bounds.height * imageRatio;
  const fitHeight = imageRatio >= boundsRatio ? bounds.width / imageRatio : bounds.height;
  const drawWidth = fitWidth * scale;
  const drawHeight = fitHeight * scale;
  const drawX = bounds.x + (bounds.width - drawWidth) / 2 + reference.offset.x;
  const drawY = bounds.y + (bounds.height - drawHeight) / 2 + reference.offset.y;
  context.drawImage(
    reference.image,
    drawX * cellSize,
    drawY * cellSize,
    drawWidth * cellSize,
    drawHeight * cellSize,
  );
  context.restore();
}

function drawGrid(context: CanvasRenderingContext2D, project: BeadProject, cellSize: number): void {
  context.strokeStyle = '#d6d3cc';
  context.lineWidth = 1;
  for (let x = 0; x <= project.width; x += 1) {
    context.beginPath();
    context.moveTo(x * cellSize, 0);
    context.lineTo(x * cellSize, project.height * cellSize);
    context.stroke();
  }
  for (let y = 0; y <= project.height; y += 1) {
    context.beginPath();
    context.moveTo(0, y * cellSize);
    context.lineTo(project.width * cellSize, y * cellSize);
    context.stroke();
  }
}

function drawCoordinates(context: CanvasRenderingContext2D, project: BeadProject, cellSize: number): void {
  context.fillStyle = 'rgba(17,24,39,0.45)';
  context.font = '8px Arial';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  for (let x = 0; x < project.width; x += 5) {
    context.fillText(String(x + 1), x * cellSize + 2, 2);
  }
  for (let y = 0; y < project.height; y += 5) {
    context.fillText(String(y + 1), 2, y * cellSize + 2);
  }
}

function drawPegboardBoundaries(context: CanvasRenderingContext2D, project: BeadProject, cellSize: number): void {
  const verticalGuides = guideLineCenters(project.width, project.boardSettings.boardWidth, cellSize);
  const horizontalGuides = guideLineCenters(project.height, project.boardSettings.boardHeight, cellSize);

  context.save();
  context.strokeStyle = 'rgba(54, 102, 108, 0.32)';
  context.lineWidth = 1.25;
  context.setLineDash([4, 6]);
  verticalGuides.forEach((x) => {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, project.height * cellSize);
    context.stroke();
  });
  horizontalGuides.forEach((y) => {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(project.width * cellSize, y);
    context.stroke();
  });
  context.setLineDash([]);
  context.restore();
}

function guideLineCenters(totalCells: number, boardCells: number, cellSize: number): number[] {
  const centers = new Set<number>();
  const boardSize = Math.max(1, boardCells);
  for (let boardStart = 0; boardStart < totalCells; boardStart += boardSize) {
    const segmentLength = Math.min(boardSize, totalCells - boardStart);
    for (let offset = 1; offset < segmentLength; offset += 5) {
      centers.add((boardStart + offset) * cellSize);
    }
    if (segmentLength > 1) {
      centers.add((boardStart + segmentLength - 1) * cellSize);
    }
  }
  return [...centers].sort((a, b) => a - b);
}

function drawBeadStack(
  context: CanvasRenderingContext2D,
  stack: Array<{ layer: BeadLayer; colorId: string }>,
  left: number,
  top: number,
  cellSize: number,
): void {
  if (stack.length === 0) return;

  const topItem = stack[stack.length - 1];
  const color = getColor(topItem.colorId);
  if (!color) return;
  context.globalAlpha = Number.isFinite(topItem.layer.opacity) ? topItem.layer.opacity : 1;
  context.beginPath();
  context.fillStyle = color.hex;
  context.arc(left + cellSize / 2, top + cellSize / 2, cellSize * 0.42, 0, Math.PI * 2);
  context.fill();
  if (isLightColor(color.rgb)) {
    context.strokeStyle = 'rgba(17, 24, 39, 0.22)';
    context.lineWidth = Math.max(1, cellSize * 0.055);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function isLightColor(rgb: [number, number, number]): boolean {
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luminance > 218;
}

function drawStackOverlay(
  context: CanvasRenderingContext2D,
  stack: Array<{ layer: BeadLayer; colorId: string }>,
  left: number,
  top: number,
  cellSize: number,
): void {
  const count = stack.length;
  const badgeRadius = Math.max(3.5, Math.min(5.5, cellSize * 0.25));
  const badgeX = left + badgeRadius + 1;
  const badgeY = top + badgeRadius + 1;
  const stripColors = stack.slice(-4);
  const stripWidth = Math.max(2, Math.min(3.2, cellSize * 0.15));
  const stripHeight = cellSize - 6;
  const stripLeft = left + cellSize - stripWidth - 2;
  const stripTop = top + 3;
  const segmentHeight = stripHeight / stripColors.length;

  context.save();
  context.beginPath();
  context.fillStyle = 'rgba(17, 24, 39, 0.72)';
  context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = `${Math.max(7, badgeRadius * 1.35)}px Arial`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(Math.min(count, 9)), badgeX, badgeY + 0.2);
  if (count > 9) {
    context.beginPath();
    context.fillStyle = '#ffffff';
    context.arc(badgeX + badgeRadius * 0.78, badgeY - badgeRadius * 0.78, Math.max(1, badgeRadius * 0.22), 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = 'rgba(17, 24, 39, 0.42)';
  context.fillRect(stripLeft - 0.5, stripTop - 0.5, stripWidth + 1, stripHeight + 1);
  stripColors.forEach(({ colorId }, index) => {
    const color = getColor(colorId);
    if (!color) return;
    context.fillStyle = color.hex;
    context.fillRect(stripLeft, stripTop + index * segmentHeight, stripWidth, Math.ceil(segmentHeight));
  });
  if (count > stripColors.length) {
    context.fillStyle = 'rgba(255, 255, 255, 0.92)';
    context.fillRect(stripLeft, stripTop + stripHeight - Math.max(1, stripHeight * 0.12), stripWidth, Math.max(1, stripHeight * 0.12));
  }
  context.restore();
}

function drawCellAlert(context: CanvasRenderingContext2D, left: number, top: number, cellSize: number): void {
  const centerX = left + cellSize / 2;
  const centerY = top + cellSize / 2;
  const radius = cellSize * 0.43;
  const badgeRadius = Math.max(4.2, cellSize * 0.23);
  const badgeX = left + cellSize - badgeRadius - 1.4;
  const badgeY = top + badgeRadius + 1.4;
  context.save();
  context.beginPath();
  context.fillStyle = 'rgba(255, 193, 7, 0.28)';
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(185, 58, 50, 0.95)';
  context.lineWidth = Math.max(1.6, cellSize * 0.11);
  context.stroke();
  context.beginPath();
  context.fillStyle = '#b93a32';
  context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = `${Math.max(8, badgeRadius * 1.65)}px Arial`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('!', badgeX, badgeY + 0.3);
  context.restore();
}

function getActiveLayerCells(project: BeadProject): Array<string | null> {
  return (project.layers ?? []).find((layer) => layer.id === project.activeLayerId)?.cells ?? project.cells;
}

function getTopVisibleColor(project: BeadProject, index: number): string | null {
  const layers = project.layers ?? [];
  for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = layers[layerIndex];
    if (!layer.visible) continue;
    const colorId = layer.cells?.[index];
    if (colorId) return colorId;
  }
  return null;
}

function floodFill(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
  selectedColorId: string,
): Array<string | null> {
  const next = cells.slice();
  const startIndex = y * width + x;
  const target = next[startIndex];
  if (target === selectedColorId) return next;
  const replacement = selectedColorId;
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop() as [number, number];
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const index = cy * width + cx;
    if (next[index] !== target) continue;
    next[index] = replacement;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return next;
}

function readableTextColor(rgb: [number, number, number]): string {
  const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return luminance < 130 ? '#ffffff' : '#111827';
}
