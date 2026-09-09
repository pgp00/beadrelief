import WorkspaceCanvas from './WorkspaceCanvas.js';
import ThreePreview from './ThreePreview.js';
import PrintSettingsPanel from './PrintSettingsPanel.js';
import HelpDialog from './HelpDialog.js';
import { autoGenerationPaletteKey, beginAutoGenerationEffect, canEditLayer, codedUiError, generationBlocksExport, hasLayerCapacity, imageLaunchState, loadHeartSample, pendingGenerationAction, printOptionsForProject, projectForDisplay, replaceGeneratedProject, resizeWouldCropProject, shouldAutoRegenerate } from './appLogic.js';
import { downloadMaterialProfile, downloadPrintPdf, downloadPrintPng, downloadProjectJson, downloadUsageWorkbook } from './exporters.js';
import type { PrintExportOptions } from './exporters.js';
import { imageFileToBeads } from './imageToBeads.js';
import { adjustLayerCells, applyEffectToLayer, defaultAdjustments, hasAdjustments, limitLayerColors, mergeCloseLayerColors, mergeIsolatedLayerColors } from './imageAdjustments.js';
import type { AdjustmentSettings, LayerEffect } from './imageAdjustments.js';
import { languageKey, resolveLanguage, ui } from './i18n.js';
import type { Language } from './i18n.js';
import { amsColorToPaletteColor } from './print/colors.js';
import { buildPrintableModel, composePrintableGrid } from './print/model.js';
import { applyMeasuredStackColors, buildStackPalette, hasCompleteStackCalibration } from './print/stacking.js';
import { buildPrintRecipe } from './print/recipe.js';
import { applyMaterialProfile, calibrationProject, MAX_PROFILE_FILE_BYTES } from './print/profile.js';
import { downloadThreeMf } from './print/threeMf.js';
import { validatePrintableModel } from './print/validation.js';
import { basicPalette, completePalette, getColor } from './palette.js';
import { MAX_PROJECT_DIMENSION, MAX_PROJECT_FILE_BYTES, composeVisibleCells, createLayer, createProject, hasEditableWork, isSafeProjectImport, loadDraft, normalizeProject, projectGridChanged, saveDraft, withCells, withLayers } from './project.js';
import { findIsolatedBeads, summarizeLayeredUsage, summarizeUsage } from './usage.js';
import type { ArrowKind, BackgroundMode, BeadProject, ClipboardPattern, CopyMode, CropAspect, GenerationStyle, MirrorDirection, MoveMode, PaletteColor, RemoveMode, RightClickAction, ShapeFillMode, ShapeKind, TextDirection, ToolId } from './types.js';

const { useCallback, useEffect, useMemo, useRef, useState } = React;

const tools: ToolId[] = [
  'pencil',
  'eraser',
  'fill',
  'remove',
  'recolor',
  'eyedropper',
  'move',
  'copy',
  'paste',
  'mirror',
  'shape',
  'text',
  'pan',
];

const printSizePresets = [
  { label: '16 × 16', width: 16, height: 16 },
  { label: '24 × 24', width: 24, height: 24 },
  { label: '32 × 32', width: 32, height: 32 },
  { label: '50 × 50', width: 50, height: 50 },
];

const patternSizePresets = [15, 29, 52, 78, 104].map((size) => ({
  label: `${size} × ${size}`,
  width: size,
  height: size,
}));

const defaultImportSettings = {
  width: 32,
  generationStyle: 'realistic' as GenerationStyle,
  backgroundMode: 'keep' as BackgroundMode,
  tolerance: 32,
  speckleReduction: 0,
  cropAspect: 'original' as CropAspect,
  cropZoom: 1,
  cropOffsetX: 0,
  cropOffsetY: 0,
};

const defaultColorId = 'ams-1-1c1c1c';
const defaultRecentColorIds = ['ams-1-1c1c1c', 'ams-2-f4f1e8'];

type HoverCell = { x: number; y: number; colorId: string | null };
type DragTarget = { id: string; edge: 'before' | 'after' };
type FloatingHelp = { text: string; left: number; top: number };
type ReferencePlacement = 'below' | 'above';
type OutputMode = 'pattern' | 'three-d';
type PaletteMode = 'basic' | 'complete';

const MAX_PRINT_WORKSPACE_DIMENSION = 50;

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);
  const printExportButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpDialogRef = useRef<HTMLDialogElement | null>(null);
  const autoGenerateShouldCommitRef = useRef(false);
  const generationRequestRef = useRef(0);
  const autoGenerationPendingRef = useRef(false);
  const suppressAutoGenerationRef = useRef(false);
  const generateFromImageRef = useRef(generateFromImage);
  const adjustmentSessionRef = useRef<{ layerId: string | null; baseCells: Array<string | null> }>({ layerId: null, baseCells: [] });
  const [language, setLanguage] = useState<Language>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(languageKey);
    } catch {
      // session-only
    }
    const initialLanguage = resolveLanguage(saved, navigator.language);
    if (typeof document !== 'undefined') document.documentElement.lang = initialLanguage;
    return initialLanguage;
  });
  const languageRef = useRef(language);
  languageRef.current = language;
  const text = ui[language];
  const [outputMode, setOutputMode] = useState<OutputMode>('pattern');
  const sizePresets = outputMode === 'pattern' ? patternSizePresets : printSizePresets;
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('complete');
  const [project, setProject] = useState<BeadProject>(() => createProject());
  const initialProjectRef = useRef(project);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [previewProject, setPreviewProject] = useState(project);
  const projectRef = useRef(project);
  projectRef.current = project;
  const [patternColorLimit, setPatternColorLimit] = useState(completePalette.length);
  const projectGenerationKey = (value: BeadProject) => outputMode === 'pattern'
    ? `pattern:${paletteMode}:${patternColorLimit}`
    : autoGenerationPaletteKey(value.printSettings.mode, value.amsColors);
  const autoGenerationKey = projectGenerationKey(project);
  const [selectedColorId, setSelectedColorId] = useState(defaultColorId);
  const [recentColorIds, setRecentColorIds] = useState(defaultRecentColorIds);
  const [tool, setTool] = useState<ToolId>('pencil');
  const [eraserSize, setEraserSize] = useState(0);
  const [removeMode, setRemoveMode] = useState<RemoveMode>('same-connected');
  const [moveMode, setMoveMode] = useState<MoveMode>('layer');
  const [mirrorMode, setMirrorMode] = useState<MoveMode>('layer');
  const [mirrorDirection, setMirrorDirection] = useState<MirrorDirection>('horizontal');
  const [shapeKind, setShapeKind] = useState<ShapeKind>('line');
  const [shapeFillMode, setShapeFillMode] = useState<ShapeFillMode>('outline');
  const [arrowKind, setArrowKind] = useState<ArrowKind>('single');
  const [textToolValue, setTextToolValue] = useState('ABC');
  const [textToolDirection, setTextToolDirection] = useState<TextDirection>('horizontal');
  const [textToolSize, setTextToolSize] = useState(17);
  const [textToolSpacing, setTextToolSpacing] = useState(1);
  const [showPrintExportPanel, setShowPrintExportPanel] = useState(false);
  const [printExportOptions, setPrintExportOptions] = useState<PrintExportOptions>({
    format: 'png',
    exportBounds: 'pattern',
    showColorCodes: true,
    showGuideLines: true,
    authorName: '',
  });
  const [openToolOptions, setOpenToolOptions] = useState<ToolId | null>(null);
  const [clipboardPattern, setClipboardPattern] = useState<ClipboardPattern | null>(null);
  const [copyMode, setCopyMode] = useState<CopyMode>('connected');
  const [copySelectionIndices, setCopySelectionIndices] = useState<number[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [referenceVisible, setReferenceVisible] = useState(false);
  const [referenceOpacity, setReferenceOpacity] = useState(0.35);
  const [referenceScale, setReferenceScale] = useState(1);
  const [referenceOffset, setReferenceOffset] = useState({ x: 0, y: 0 });
  const [referenceAdjusting, setReferenceAdjusting] = useState(false);
  const [referencePlacement, setReferencePlacement] = useState<ReferencePlacement>('below');
  const [canvasWidth, setCanvasWidth] = useState(project.width);
  const [canvasHeight, setCanvasHeight] = useState(project.height);
  const [importSettings, setImportSettings] = useState(defaultImportSettings);
  const { width: convertWidth, generationStyle, backgroundMode, tolerance, speckleReduction, cropAspect, cropZoom, cropOffsetX, cropOffsetY } = importSettings;
  const [autoGenerationRestartToken, setAutoGenerationRestartToken] = useState(0);
  const [manualEditsSinceGeneration, setManualEditsSinceGeneration] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState(text.workspaceReady);
  const [floatingHelp, setFloatingHelp] = useState<FloatingHelp | null>(null);
  const [hoverCell, setHoverCell] = useState<HoverCell | null>(null);
  const [highlightedColorId, setHighlightedColorId] = useState<string | null>(null);
  const [showIsolatedBeads, setShowIsolatedBeads] = useState(false);
  const [rightTab, setRightTab] = useState<'palette' | 'layers' | 'usage' | 'adjustments'>('palette');
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [paletteGroup, setPaletteGroup] = useState('all');
  const [adjustments, setAdjustments] = useState<AdjustmentSettings>(defaultAdjustments);
  const [colorCleanupStrength, setColorCleanupStrength] = useState(2);
  const [layerColorLimit, setLayerColorLimit] = useState(16);
  const [past, setPast] = useState<BeadProject[]>([]);
  const [future, setFuture] = useState<BeadProject[]>([]);
  const usage = useMemo(() => summarizeUsage(previewProject), [previewProject]);
  const layeredUsage = useMemo(() => (
    outputMode === 'three-d' && previewProject.printSettings.mode === 'layered'
      ? summarizeLayeredUsage(previewProject)
      : []
  ), [outputMode, previewProject]);
  const layeredOutput = outputMode === 'three-d' && project.printSettings.mode === 'layered';
  const printRecipe = useMemo(
    () => outputMode === 'three-d' ? buildPrintRecipe(previewProject) : null,
    [outputMode, previewProject],
  );
  const totalBeads = usage.reduce((sum, row) => sum + row.count, 0);
  const totalPacks = usage.reduce((sum, row) => sum + row.packs, 0);
  const boardCount =
    Math.ceil(project.width / project.boardSettings.boardWidth) *
    Math.ceil(project.height / project.boardSettings.boardHeight);
  const isolatedBeadRefs = useMemo(() => findIsolatedBeads(previewProject), [previewProject]);
  const isolatedBeads = isolatedBeadRefs.length;
  const isolatedCellIndices = useMemo(
    () => (showIsolatedBeads ? [...new Set(isolatedBeadRefs.map((item) => item.index))] : []),
    [isolatedBeadRefs, showIsolatedBeads],
  );
  const selectedColor = getColor(selectedColorId);
  const solidPalette = useMemo(() => project.amsColors.map(amsColorToPaletteColor), [project.amsColors]);
  const stackPalette = useMemo(() => (
    project.printSettings.mode === 'layered'
      ? applyMeasuredStackColors(buildStackPalette(project.amsColors), project.materialProfile.measuredColors)
      : []
  ), [project.amsColors, project.materialProfile.measuredColors, project.printSettings.mode]);
  const calibrationPalette = useMemo(
    () => project.amsColors.length >= 2 ? buildStackPalette(project.amsColors) : [],
    [project.amsColors],
  );
  const calibrationComplete = project.amsColors.length >= 2
    && hasCompleteStackCalibration(project.amsColors.length, project.materialProfile.measuredColors);
  const activePalette = outputMode === 'pattern'
    ? paletteMode === 'basic' ? basicPalette : completePalette
    : project.printSettings.mode === 'layered' ? stackPalette : solidPalette;
  const recentColors = recentColorIds.flatMap((id) => {
    const color = activePalette.find((item) => item.id === id);
    return color ? [color] : [];
  });
  const paletteGroups = useMemo(
    () => [
      { id: 'all', label: 'All' },
      ...[...new Set(activePalette.map((color) => color.group))].map((group) => ({ id: group, label: group })),
    ],
    [activePalette],
  );
  const visiblePalette = useMemo(
    () => (paletteGroup === 'all' ? activePalette : activePalette.filter((color) => color.group === paletteGroup)),
    [activePalette, paletteGroup],
  );

  function displayCode(color: NonNullable<typeof selectedColor>): string {
    return color.primaryCode;
  }

  function displayName(color: NonNullable<typeof selectedColor>): string {
    return color.name;
  }

  function showFloatingHelp(anchor: HTMLElement, tooltip: string) {
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = 172;
    const left = Math.min(rect.right + 8, window.innerWidth - tooltipWidth - 10);
    setFloatingHelp({
      text: tooltip,
      left,
      top: rect.top + rect.height / 2,
    });
  }

  function imageHelpProps(tooltip: string) {
    return {
      'data-tooltip': tooltip,
      'aria-label': tooltip,
      tabIndex: 0,
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => showFloatingHelp(event.currentTarget, tooltip),
      onMouseLeave: () => setFloatingHelp(null),
      onFocus: (event: React.FocusEvent<HTMLElement>) => showFloatingHelp(event.currentTarget, tooltip),
      onBlur: () => setFloatingHelp(null),
    };
  }

  const displayCodeById = useCallback((colorId: string): string => getColor(colorId)?.primaryCode ?? '', []);

  function layerDisplayName(layer: BeadProject['layers'][number], index: number): string {
    if (layer.customName) return layer.name;
    const match = layer.name.match(/^(?:Layer|图层)\s+(\d+)$/);
    if (match) return `${text.layer} ${match[1]}`;
    if (layer.id === 'base' || layer.name === 'Pattern' || layer.name === 'Base bead layer' || layer.name === '基础珠子层') {
      return systemLayerName(index);
    }
    if (!layer.name.trim()) return `${text.layer} ${index + 1}`;
    return layer.name;
  }

  function systemLayerName(index: number): string {
    return `${text.layer} ${index + 1}`;
  }

  function startEditingLayer(layer: BeadProject['layers'][number], index: number) {
    setEditingLayerId(layer.id);
    setEditingLayerName(layerDisplayName(layer, index));
  }

  function saveEditingLayer(layer: BeadProject['layers'][number], index: number) {
    const nextName = editingLayerName.trim();
    setEditingLayerId(null);
    if (!nextName) return;
    const isSystemName = nextName === `图层 ${index + 1}` || nextName === `Layer ${index + 1}`;
    if (isSystemName && !layer.customName) return;
    if (nextName === layer.name && layer.customName) return;
    updateLayer(layer.id, { name: nextName, customName: !isSystemName });
  }

  function layerMetaText(isActive: boolean, isVisible: boolean, isLocked: boolean, beadCount: number): string {
    const countText = text.layerBeadCount(beadCount);
    const states = [];
    if (isActive) states.push(text.activeLayer);
    if (!isVisible) states.push(text.hiddenLayer);
    if (isLocked) states.push(text.lockedLayer);
    states.push(countText);
    return states.join(' - ');
  }

  generateFromImageRef.current = generateFromImage;

  useEffect(() => {
    let cancelled = false;
    void loadDraft().then((draft) => {
      if (cancelled) return;
      if (draft) setProject((current) => current === initialProjectRef.current ? draft : current);
      setDraftLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const saved = await saveDraft(project);
      if (!cancelled && projectRef.current === project) setDraftSaveFailed(!saved);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project, draftLoaded]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewProject(project), 250);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    try {
      localStorage.setItem(languageKey, language);
    } catch {
      setNotice(text.storageUnavailable);
    }
    if (typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language, text.storageUnavailable]);

  useEffect(() => {
    return () => {
      if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    };
  }, [pendingImageUrl]);

  useEffect(() => {
    return () => {
      if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl);
    };
  }, [referenceImageUrl]);

  useEffect(() => {
    setCanvasWidth(project.width);
    setCanvasHeight(project.height);
  }, [project.width, project.height]);

  useEffect(() => {
    setNotice(text.workspaceReady);
  }, [language, text.workspaceReady]);

  useEffect(() => {
    if (!activePalette.some((color) => color.id === selectedColorId)) {
      setSelectedColorId(activePalette[0].id);
    }
    if (!paletteGroups.some((group) => group.id === paletteGroup)) {
      setPaletteGroup('all');
    }
  }, [activePalette, paletteGroups, paletteGroup, selectedColorId]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith('image/'));
      if (file) handleImageFile(file);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [project, language]);

  useEffect(() => {
    const shouldGenerate = beginAutoGenerationEffect(generationRequestRef, suppressAutoGenerationRef);
    setIsGenerating(false);
    if (!shouldGenerate || !pendingFile) {
      autoGenerationPendingRef.current = false;
      autoGenerateShouldCommitRef.current = false;
      return;
    }
    if (!shouldAutoRegenerate(Boolean(pendingFile), manualEditsSinceGeneration)) {
      autoGenerationPendingRef.current = false;
      autoGenerateShouldCommitRef.current = false;
      setNotice(text.regenerateFromImage);
      return;
    }
    autoGenerationPendingRef.current = true;
    setIsGenerating(true);
    const effectRequestId = generationRequestRef.current;
    const timer = window.setTimeout(() => {
      if (effectRequestId !== generationRequestRef.current) return;
      const shouldCommit = autoGenerateShouldCommitRef.current;
      void generateFromImageRef.current({ recordHistory: shouldCommit, automatic: true });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [pendingFile, importSettings, autoGenerationKey, autoGenerationRestartToken, manualEditsSinceGeneration]);

  function commitHistory() {
    const snapshot = projectRef.current;
    resetAdjustments(false);
    setPast((items) => [...items.slice(-39), snapshot]);
    setFuture([]);
  }

  function updateProject(next: BeadProject, source: 'manual' | 'generated' | 'settings' = 'manual') {
    if (source === 'generated') {
      const hadManualEdits = manualEditsSinceGeneration;
      setManualEditsSinceGeneration(false);
      if (hadManualEdits) suppressAutoGenerationRef.current = true;
    } else if (projectGridChanged(project, next)) {
      setManualEditsSinceGeneration(true);
      generationRequestRef.current += 1;
      autoGenerationPendingRef.current = false;
      setIsGenerating(false);
    }
    setProject({ ...next, updatedAt: new Date().toISOString() });
  }

  function invalidateGeneration() {
    const action = pendingGenerationAction(autoGenerationPendingRef.current, suppressAutoGenerationRef.current);
    generationRequestRef.current += 1;
    setIsGenerating(false);
    if (action !== 'none') setAutoGenerationRestartToken((current) => current + 1);
  }

  function markGenerationPending() {
    if (!pendingFile || !shouldAutoRegenerate(true, manualEditsSinceGeneration)) return;
    autoGenerationPendingRef.current = true;
    setIsGenerating(true);
  }

  function updateImportSetting<K extends keyof typeof defaultImportSettings>(key: K, value: (typeof defaultImportSettings)[K]) {
    markGenerationPending();
    setImportSettings((current) => ({ ...current, [key]: value }));
  }

  function blockExportWhileGenerating(): boolean {
    if (!generationBlocksExport(isGenerating, autoGenerationPendingRef.current)) return false;
    setNotice(text.exportBlocked);
    return true;
  }

  function updatePrintProject(next: BeadProject) {
    if (autoGenerationPaletteKey(project.printSettings.mode, project.amsColors)
      !== autoGenerationPaletteKey(next.printSettings.mode, next.amsColors)) {
      invalidateGeneration();
      markGenerationPending();
    }
    updateProject(next, 'settings');
  }

  function selectOutputMode(next: OutputMode) {
    if (next === outputMode) return;
    setOutputMode(next);
    if (next === 'three-d') {
      setPreviewProject(projectRef.current);
      setImportSettings((current) => ({ ...current, width: Math.min(current.width, MAX_PRINT_WORKSPACE_DIMENSION) }));
    }
    setShowPrintExportPanel(false);
    setNotice(next === 'pattern' ? text.patternModeSelected : text.threeDModeSelected);
  }

  const selectColor = useCallback((colorId: string, options: { updateRecent?: boolean } = {}) => {
    setSelectedColorId(colorId);
    if (options.updateRecent === false) return;
    setRecentColorIds((current) => [colorId, ...current.filter((id) => id !== colorId)].slice(0, 7));
  }, []);

  function activateTool(nextTool: ToolId) {
    setTool(nextTool);
    setOpenToolOptions(
      nextTool === 'text' && tool === 'text' && openToolOptions === 'text'
        ? null
        : nextTool === 'fill' || nextTool === 'recolor' || nextTool === 'eyedropper'
          ? null
          : nextTool,
    );
  }

  function updateCells(cells: Array<string | null>) {
    if (!ensureActiveLayerEditable()) return;
    updateProject(withCells(project, cells));
  }

  function ensureActiveLayerEditable(): boolean {
    if (canEditLayer(activeLayer)) return true;
    setNotice(activeLayer.locked ? text.lockedCanvasHint : text.hiddenCanvasHint);
    return false;
  }

  function resetImportSettings() {
    setImportSettings(defaultImportSettings);
  }

  function resetReferenceTransform() {
    setReferenceScale(1);
    setReferenceOffset({ x: 0, y: 0 });
    setReferenceAdjusting(false);
  }

  function resetProjectSession(nextProject: BeadProject) {
    const colorIds = nextProject.amsColors.map((color) => color.id);
    setSelectedColorId(colorIds[0] ?? defaultColorId);
    setRecentColorIds(colorIds.slice(0, 2));
    setPaletteGroup('all');
    setTool('pencil');
    setOpenToolOptions(null);
    setClipboardPattern(null);
    setCopySelectionIndices([]);
    setShowPrintExportPanel(false);
    setPrintExportOptions((current) => ({ ...current, projectName: undefined, authorName: '' }));
    setPendingFile(null);
    setPendingImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setReferenceFile(null);
    setReferenceImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setReferenceVisible(false);
    resetReferenceTransform();
    resetAdjustments(false);
  }

  function resetAdjustments(restore = true) {
    const session = adjustmentSessionRef.current;
    if (restore && session.layerId === activeLayer.id && session.baseCells.length === activeLayer.cells.length) {
      updateProject(withLayers(project, layers.map((layer) => (layer.id === activeLayer.id ? { ...layer, cells: session.baseCells.slice() } : layer))));
    }
    setAdjustments(defaultAdjustments);
    adjustmentSessionRef.current = { layerId: null, baseCells: [] };
  }

  function updateAdjustment(key: keyof AdjustmentSettings, value: number) {
    if (!ensureActiveLayerEditable()) return;
    const nextAdjustments = { ...adjustments, [key]: value };
    if (adjustmentSessionRef.current.layerId !== activeLayer.id) {
      commitHistory();
      adjustmentSessionRef.current = { layerId: activeLayer.id, baseCells: activeLayer.cells.slice() };
    }
    const baseCells = adjustmentSessionRef.current.baseCells.length > 0 ? adjustmentSessionRef.current.baseCells : activeLayer.cells;
    const adjustedCells = adjustLayerCells(baseCells, nextAdjustments, activePalette);
    setAdjustments(nextAdjustments);
    updateProject(withLayers(project, layers.map((layer) => (layer.id === activeLayer.id ? { ...layer, cells: adjustedCells } : layer))));
  }

  function applyActiveLayerResult(result: { cells: Array<string | null>; changed: number }, message: string) {
    if (result.changed > 0) {
      commitHistory();
      updateProject(withLayers(project, layers.map((layer) => (
        layer.id === activeLayer.id ? { ...layer, cells: result.cells } : layer
      ))));
    }
    setNotice(message);
  }

  function applyColorCleanup() {
    if (!ensureActiveLayerEditable()) return;
    const result = mergeCloseLayerColors(activeLayer.cells, activePalette, colorCleanupStrength);
    applyActiveLayerResult(result, text.layerColorsCleaned(result.changed));
  }

  function applyLayerColorLimit() {
    if (!ensureActiveLayerEditable()) return;
    const result = limitLayerColors(activeLayer.cells, activePalette, layerColorLimit);
    applyActiveLayerResult(result, text.layerColorsLimited(result.changed, layerColorLimit));
  }

  function applyLayerEffect(effect: LayerEffect, label: string) {
    if (!ensureActiveLayerEditable()) return;
    const result = applyEffectToLayer(activeLayer.cells, activePalette, effect);
    applyActiveLayerResult(result, text.effectApplied(label, result.changed));
  }

  function replaceColor(sourceColorId: string) {
    if (!sourceColorId || sourceColorId === selectedColorId) return;
    let changed = 0;
    const visibleLayerIds = new Set(displayProject.layers.filter((layer) => layer.visible).map((layer) => layer.id));
    const nextLayers = layers.map((layer) => {
      if (layer.locked || !visibleLayerIds.has(layer.id)) return layer;
      let layerChanged = false;
      const cells = layer.cells.map((cell) => {
        if (cell !== sourceColorId) return cell;
        changed += 1;
        layerChanged = true;
        return selectedColorId;
      });
      return layerChanged ? { ...layer, cells } : layer;
    });
    if (changed === 0) return;
    commitHistory();
    updateProject(withLayers(project, nextLayers, project.activeLayerId));
    setNotice(text.recoloredBeads(changed));
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    resetAdjustments(false);
    suppressAutoGenerationRef.current = autoGenerationPendingRef.current
      || projectGenerationKey(previous) !== autoGenerationKey;
    invalidateGeneration();
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [...items, project]);
    updateProject(previous);
  }

  function redo() {
    const next = future[future.length - 1];
    if (!next) return;
    resetAdjustments(false);
    suppressAutoGenerationRef.current = autoGenerationPendingRef.current
      || projectGenerationKey(next) !== autoGenerationKey;
    invalidateGeneration();
    setFuture((items) => items.slice(0, -1));
    setPast((items) => [...items, project]);
    updateProject(next);
  }

  function allowProjectReplacement(): boolean {
    const currentProject = projectRef.current;
    const currentText = ui[languageRef.current];
    return !hasEditableWork(currentProject) || window.confirm(currentText.replaceProjectConfirm);
  }

  function startBlank(width = 32, height = 32) {
    if (!allowProjectReplacement()) return;
    const nextProject = createProject(width, height);
    invalidateGeneration();
    resetProjectSession(nextProject);
    setProject(nextProject);
    setPast([]);
    setFuture([]);
    setManualEditsSinceGeneration(false);
    resetImportSettings();
    setNotice(text.blankCanvasCreated(width, height));
  }

  function applyIsolatedColorCleanup() {
    if (!ensureActiveLayerEditable()) return;
    const result = mergeIsolatedLayerColors(activeLayer.cells, project.width, project.height);
    applyActiveLayerResult(result, text.isolatedColorsCleaned(result.changed));
  }

  function clearCanvas() {
    if (!ensureActiveLayerEditable()) return;
    if (activeLayer.cells.every((cell) => cell === null)) return;
    commitHistory();
    updateProject(withCells(project, Array.from({ length: project.width * project.height }, () => null)));
    setNotice(text.canvasCleared);
  }

  function resizeCanvas() {
    const maximum = outputMode === 'pattern' ? MAX_PROJECT_DIMENSION : MAX_PRINT_WORKSPACE_DIMENSION;
    const width = clampInteger(canvasWidth, 8, maximum);
    const height = clampInteger(canvasHeight, 8, maximum);
    if (width === project.width && height === project.height) return;
    if (resizeWouldCropProject(project, width, height) && !window.confirm(text.resizeCropConfirm)) return;

    commitHistory();
    const nextLayers = layers.map((layer) => ({
      ...layer,
      cells: resizeCells(layer.cells, project.width, project.height, width, height),
    }));
    updateProject({
      ...project,
      width,
      height,
      layers: nextLayers,
      cells: composeVisibleCells(nextLayers, width, height),
    });
    setNotice(text.canvasResized(width, height));
  }

  function applyPreset(value: string) {
    const preset = sizePresets.find((item) => item.label === value);
    if (!preset) return;
    setCanvasWidth(preset.width);
    setCanvasHeight(preset.height);
  }

  function handleImageFile(file: File, options: { replacementConfirmed?: boolean } = {}): boolean {
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/)) {
      setNotice(text.supportedImageTypes);
      return false;
    }
    if (!options.replacementConfirmed && !allowProjectReplacement()) return false;
    invalidateGeneration();
    resetProjectSession(projectRef.current);
    setManualEditsSinceGeneration(false);
    setPendingFile(file);
    autoGenerationPendingRef.current = true;
    setIsGenerating(true);
    setPendingImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setReferenceFile(file);
    setReferenceImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    resetReferenceTransform();
    autoGenerateShouldCommitRef.current = true;
    setNotice(text.generatingImage(file.name));
    return true;
  }

  async function startHeartSample() {
    if (!allowProjectReplacement()) return;
    const sampleSettings = imageLaunchState(false, project).sampleSettings;
    const file = await loadHeartSample(fetch, text.sampleLoadError);
    setImportSettings((current) => ({ ...current, ...sampleSettings }));
    handleImageFile(file, { replacementConfirmed: true });
  }

  function handleReferenceImageFile(file: File) {
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/)) {
      setNotice(text.supportedImageTypes);
      return;
    }
    setReferenceFile(file);
    setReferenceImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    resetReferenceTransform();
    setReferenceVisible(true);
    setNotice(text.referenceImageSet(file.name));
  }

  async function generateFromImage(options: { recordHistory?: boolean; automatic?: boolean } = {}) {
    if (!pendingFile) return;
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    setIsGenerating(true);
    setNotice(text.updatingPattern);
    try {
      const result = await imageFileToBeads(pendingFile, {
        width: convertWidth,
        maxColors: outputMode === 'pattern' ? patternColorLimit : activePalette.length,
        palette: activePalette,
        generationStyle,
        backgroundMode,
        backgroundColor: [255, 255, 255],
        tolerance,
        speckleReduction,
        crop: { aspect: cropAspect, zoom: cropZoom, offsetX: cropOffsetX, offsetY: cropOffsetY },
      });
      if (requestId !== generationRequestRef.current) return;
      if (options.recordHistory) {
        autoGenerateShouldCommitRef.current = false;
        commitHistory();
      } else {
        resetAdjustments(false);
      }
      const nextProject = replaceGeneratedProject(projectRef.current, result);
      updateProject(nextProject, 'generated');
      setNotice(text.patternReady(result.colorsUsed, result.totalBeads));
    } catch (error) {
      if (requestId !== generationRequestRef.current) return;
      setNotice(codedUiError('IMAGE_CONVERSION', text.imageConversionFailed));
    } finally {
      if (requestId === generationRequestRef.current) {
        autoGenerationPendingRef.current = false;
        setIsGenerating(false);
      }
    }
  }

  async function importJson(file: File): Promise<boolean> {
    if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error(codedUiError('IMPORT_TOO_LARGE', text.invalidRecord));
    let imported: unknown;
    try {
      const text = await file.text();
      imported = JSON.parse(text);
    } catch {
      throw new Error(codedUiError('IMPORT_JSON', text.unreadableRecord));
    }
    if (!isSafeProjectImport(imported, file.size)) {
      throw new Error(codedUiError('IMPORT_INVALID', text.invalidRecord));
    }
    if (!allowProjectReplacement()) return false;
    const nextProject = normalizeProject(imported);
    invalidateGeneration();
    resetProjectSession(nextProject);
    setProject(nextProject);
    setPast([]);
    setFuture([]);
    setManualEditsSinceGeneration(false);
    setNotice(text.recordImported);
    return true;
  }

  function exportUsageList() {
    if (blockExportWhileGenerating()) return;
    downloadUsageWorkbook(project, layeredOutput);
    setNotice(text.usageExported);
  }

  function exportEditRecord() {
    if (blockExportWhileGenerating()) return;
    try {
      downloadProjectJson(project);
      setNotice(text.recordExported);
    } catch (error) {
      setNotice(error instanceof RangeError ? text.recordExportTooLarge : text.exportFailed);
    }
  }

  function resetClipboard() {
    setClipboardPattern(null);
    setCopySelectionIndices([]);
    setNotice(text.clipboardReset);
  }

  function addLayer() {
    if (!hasLayerCapacity(layers.length)) {
      setNotice(text.layerLimitReached);
      return;
    }
    commitHistory();
    const nextLayer = createLayer(project.width, project.height, `${text.layers} ${layers.length + 1}`);
    updateProject(withLayers(project, [...layers, nextLayer], nextLayer.id));
  }

  function duplicateLayer(layerId: string) {
    if (!hasLayerCapacity(layers.length)) {
      setNotice(text.layerLimitReached);
      return;
    }
    const sourceIndex = layers.findIndex((layer) => layer.id === layerId);
    const source = layers[sourceIndex];
    if (!source) return;
    commitHistory();
    const displayName = layerDisplayName(source, sourceIndex);
    const nextLayer = {
      ...source,
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: uniqueDuplicateLayerName(displayName),
      customName: true,
      locked: false,
      cells: source.cells.slice(),
    };
    const nextLayers = layers.slice();
    nextLayers.splice(sourceIndex + 1, 0, nextLayer);
    updateProject(withLayers(project, nextLayers, nextLayer.id));
  }

  function uniqueDuplicateLayerName(baseName: string): string {
    const suffix = text.layerCopySuffix;
    const existingNames = new Set(layers.map((layer, index) => layerDisplayName(layer, index)));
    for (let index = 1; index < 1000; index += 1) {
      const candidate = `${baseName}-${suffix}${index}`;
      if (!existingNames.has(candidate)) return candidate;
    }
    return `${baseName}-${suffix}${Date.now()}`;
  }

  function updateLayer(layerId: string, changes: Partial<BeadProject['layers'][number]>) {
    commitHistory();
    updateProject(withLayers(project, layers.map((layer) => (layer.id === layerId ? { ...layer, ...changes } : layer))));
  }

  function updateUsageLayerSelection(includedLayerIds: Set<string>) {
    const nextLayers = layers.map((layer) => ({
      ...layer,
      includeInUsage: includedLayerIds.has(layer.id),
    }));
    const changed = nextLayers.some((layer, index) => layer.includeInUsage !== layers[index].includeInUsage);
    if (!changed) return;
    commitHistory();
    updateProject(withLayers(project, nextLayers, project.activeLayerId));
  }

  function toggleUsageLayer(layerId: string) {
    const includedLayerIds = new Set(countedLayers.map((layer) => layer.id));
    if (includedLayerIds.has(layerId)) {
      includedLayerIds.delete(layerId);
    } else {
      includedLayerIds.add(layerId);
    }
    updateUsageLayerSelection(includedLayerIds);
  }

  function toggleActiveLayerOnly() {
    updateProject({
      ...project,
      settings: { ...project.settings, showActiveLayerOnly: !project.settings.showActiveLayerOnly },
    }, 'settings');
  }

  function deleteLayer(layerId: string) {
    if (layers.length <= 1) return;
    commitHistory();
    updateProject(withLayers(project, layers.filter((layer) => layer.id !== layerId)));
  }

  function moveLayer(sourceId: string, target: DragTarget) {
    if (sourceId === target.id) return;
    const originalDisplayLayers = [...layers].reverse();
    const nextDisplayLayers = originalDisplayLayers.slice();
    const sourceIndex = nextDisplayLayers.findIndex((layer) => layer.id === sourceId);
    if (sourceIndex < 0) return;
    const [movedLayer] = nextDisplayLayers.splice(sourceIndex, 1);
    const targetIndex = nextDisplayLayers.findIndex((layer) => layer.id === target.id);
    if (targetIndex < 0) return;
    const insertIndex = target.edge === 'after' ? targetIndex + 1 : targetIndex;
    nextDisplayLayers.splice(insertIndex, 0, movedLayer);
    const originalOrder = originalDisplayLayers.map((layer) => layer.id).join('|');
    const nextOrder = nextDisplayLayers.map((layer) => layer.id).join('|');
    if (originalOrder === nextOrder) return;
    commitHistory();
    updateProject(withLayers(project, nextDisplayLayers.reverse(), project.activeLayerId));
  }

  async function importProfile(file: File) {
    if (file.size < 1 || file.size > MAX_PROFILE_FILE_BYTES) throw new Error(text.invalidProfile);
    let value: unknown;
    try {
      value = JSON.parse(await file.text());
    } catch {
      throw new Error(text.invalidProfile);
    }
    commitHistory();
    updatePrintProject(applyMaterialProfile(projectRef.current, value));
    setNotice(text.profileImported);
  }

  function moveLayerBy(sourceId: string, direction: -1 | 1) {
    const sourceIndex = layers.findIndex((layer) => layer.id === sourceId);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= layers.length) return;
    const nextLayers = layers.slice();
    [nextLayers[sourceIndex], nextLayers[targetIndex]] = [nextLayers[targetIndex], nextLayers[sourceIndex]];
    commitHistory();
    updateProject(withLayers(project, nextLayers, project.activeLayerId));
  }

  function dragTargetFromEvent(event: React.DragEvent<HTMLElement>, layerId: string): DragTarget {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      id: layerId,
      edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
    };
  }

  function selectLayer(layerId: string) {
    updateProject({ ...project, activeLayerId: layerId }, 'settings');
  }

  function setBeadsPerPack(value: number) {
    updateProject({
      ...project,
      settings: {
        ...project.settings,
        beadsPerPack: clampInteger(value, 1, 10000),
      },
    });
  }


  function stepBeadsPerPack(direction: -1 | 1) {
    const current = project.settings.beadsPerPack;
    const step = 500;
    const next =
      direction > 0
        ? current % step === 0
          ? current + step
          : Math.ceil(current / step) * step
        : current % step === 0
          ? current - step
          : Math.floor(current / step) * step;
    setBeadsPerPack(Math.max(step, next));
  }

  const layers = project.layers;
  const activeLayer = layers.find((layer) => layer.id === project.activeLayerId) ?? layers[0];
  const canEditActiveLayer = canEditLayer(activeLayer);
  const previewActiveLayer = previewProject.layers.find((layer) => layer.id === previewProject.activeLayerId)
    ?? previewProject.layers[0];
  const isolatedColorCount = useMemo(
    () => previewActiveLayer
      ? mergeIsolatedLayerColors(previewActiveLayer.cells, previewProject.width, previewProject.height).changed
      : 0,
    [previewActiveLayer, previewProject.width, previewProject.height],
  );
  const countedLayers = layers.filter((layer) => layer.includeInUsage);
  useEffect(() => {
    setCopySelectionIndices([]);
    setAdjustments(defaultAdjustments);
    adjustmentSessionRef.current = { layerId: null, baseCells: [] };
  }, [activeLayer.id, project.width, project.height]);
  const displayProject = useMemo(() => projectForDisplay(project), [project]);
  const previewDisplayProject = useMemo(() => projectForDisplay(previewProject), [previewProject]);
  const printableModel = useMemo(
    () => outputMode === 'three-d' ? buildPrintableModel(composePrintableGrid(previewProject)) : null,
    [outputMode, previewProject],
  );
  const printErrors = useMemo(() => {
    if (!printableModel) return [];
    const errors = validatePrintableModel(printableModel, false);
    return errors.length ? [codedUiError('EXPORT_INVALID', text.exportValidationFailed)] : [];
  }, [printableModel, text.exportValidationFailed]);

  async function exportThreeMf() {
    if (blockExportWhileGenerating()) return;
    if (isExporting) return;
    setIsExporting(true);
    setNotice(text.buildingThreeMf);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const exportModel = buildPrintableModel(composePrintableGrid(projectRef.current));
      const exportErrors = validatePrintableModel(exportModel, false);
      if (exportErrors.length > 0) {
        setNotice(codedUiError('EXPORT_INVALID', text.exportValidationFailed));
        const errorRegion = document.getElementById('print-export-errors');
        errorRegion?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        errorRegion?.focus({ preventScroll: true });
        return;
      }
      const stem = project.name
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
        .replace(/\s+/g, '-')
        .slice(0, 80) || 'beadrelief';
      await downloadThreeMf(exportModel, `${stem}.3mf`);
      setNotice(text.threeMfDownloaded);
    } catch (error) {
      setNotice(codedUiError('EXPORT_FAILED', text.exportFailed));
    } finally {
      setIsExporting(false);
    }
  }

  async function exportCalibrationThreeMf() {
    const calibration = calibrationProject(projectRef.current);
    const model = buildPrintableModel(composePrintableGrid(calibration));
    const errors = validatePrintableModel(model);
    if (errors.length) {
      setNotice(codedUiError('EXPORT_INVALID', text.exportValidationFailed));
      return;
    }
    await downloadThreeMf(model, 'beadrelief-layered-calibration.3mf');
    setNotice(text.calibrationDownloaded);
  }

  function patchMaterialProfile(changes: Partial<BeadProject['materialProfile']>, resetCalibration = false) {
    updateProject({
      ...project,
      materialProfile: {
        ...project.materialProfile,
        ...changes,
        ...(resetCalibration ? { verified: false, measuredColors: [] } : {}),
      },
    }, 'settings');
  }

  function setMeasuredStackColor(stopLevel: number, hex: string) {
    commitHistory();
    const measuredColors = project.materialProfile.measuredColors
      .filter((color) => color.stopLevel !== stopLevel)
      .concat({ stopLevel, hex })
      .sort((left, right) => left.stopLevel - right.stopLevel);
    patchMaterialProfile({ verified: false, measuredColors });
  }
  const shapeLabel = {
    line: text.shapeLine,
    rectangle: text.shapeRectangle,
    square: text.shapeSquare,
    ellipse: text.shapeEllipse,
    circle: text.shapeCircle,
    triangle: text.shapeTriangle,
    arrow: text.shapeArrow,
  } satisfies Record<ShapeKind, string>;
  const arrowLabel = {
    single: text.arrowSingle,
    double: text.arrowDouble,
    block: text.arrowBlock,
  } satisfies Record<ArrowKind, string>;
  const rightTabLabel = {
    palette: text.palette,
    layers: text.layers,
    usage: text.usage,
    adjustments: text.adjustments,
  } satisfies Record<typeof rightTab, string>;
  const selectedSizePreset = sizePresets.find((item) => item.width === canvasWidth && item.height === canvasHeight)?.label ?? '';
  function closePrintExportPanel() {
    setShowPrintExportPanel(false);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => printExportButtonRef.current?.focus()));
  }

  async function exportPrintPattern() {
    if (blockExportWhileGenerating()) return;
    if (isExporting) return;
    const exportOptions = printOptionsForProject(project, printExportOptions, text.layer);
    const format = (printExportOptions.format ?? 'png').toUpperCase();
    setIsExporting(true);
    setNotice(text.patternExporting(format));
    try {
      if (printExportOptions.format === 'pdf') {
        await downloadPrintPdf(project, exportOptions);
      } else {
        await downloadPrintPng(project, exportOptions);
      }
      closePrintExportPanel();
      setNotice(text.patternExported(format));
    } catch {
      setNotice(codedUiError('PATTERN_EXPORT_FAILED', text.patternExportFailed));
    } finally {
      setIsExporting(false);
    }
  }

  const imageLaunch = imageLaunchState(Boolean(pendingFile), project);
  const exportDisabled = generationBlocksExport(isGenerating, autoGenerationPendingRef.current) || isExporting;

  return (
    <main
      className="app-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = [...event.dataTransfer.files].find((item) => item.type.startsWith('image/'));
        if (file) handleImageFile(file);
      }}
    >
      <input
        ref={fileInputRef}
        className="hidden-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) handleImageFile(file);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={referenceInputRef}
        className="hidden-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) handleReferenceImageFile(file);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={jsonInputRef}
        className="hidden-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          const input = event.currentTarget;
          if (file) {
            void importJson(file).catch((error) => setNotice(error.message));
          }
          input.value = '';
        }}
      />
      <input
        ref={profileInputRef}
        className="hidden-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void importProfile(file).catch(() => setNotice(codedUiError('PROFILE_IMPORT', text.invalidProfile)));
          event.currentTarget.value = '';
        }}
      />

      <header className="topbar">
        <div className="brand-lockup" aria-label="BeadRelief">
          <span className="logo-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <div>
            <strong>{text.appName}</strong>
            <small>
              {text.status(project.width, project.height, totalBeads, usage.length)}
            </small>
          </div>
        </div>

        <div className="topbar-workspace">
          <div className="topbar-params canvas-params" aria-label={text.canvasControls}>
            <span className="topbar-control-label">{text.board}</span>
            <div className="topbar-dimension-group">
              <input aria-label={text.canvasWidth} type="number" min={8} max={outputMode === 'pattern' ? MAX_PROJECT_DIMENSION : MAX_PRINT_WORKSPACE_DIMENSION} value={canvasWidth} onChange={(event) => setCanvasWidth(Number(event.target.value))} />
              <span className="size-times">×</span>
              <input aria-label={text.canvasHeight} type="number" min={8} max={outputMode === 'pattern' ? MAX_PROJECT_DIMENSION : MAX_PRINT_WORKSPACE_DIMENSION} value={canvasHeight} onChange={(event) => setCanvasHeight(Number(event.target.value))} />
            </div>
            <select className="canvas-preset-select" aria-label={text.canvasPreset} value={selectedSizePreset || ''} onChange={(event) => applyPreset(event.target.value)}>
              <option value="" disabled hidden>{text.commonSizes}</option>
              {sizePresets.map((preset) => (
                <option key={preset.label} value={preset.label}>{preset.label}</option>
              ))}
            </select>
            <button className="canvas-apply-button" onClick={resizeCanvas}>{text.apply}</button>
          </div>

          <div className="topbar-command-zone">
            <div className="topbar-actions project-actions">
              <button className="project-action-button primary-action" onClick={() => startBlank()}>{text.new}</button>
              <button className="project-action-button" onClick={clearCanvas}>{text.clear}</button>
              <span className="project-action-divider" aria-hidden="true" />
              <button className="project-action-button history-action" onClick={undo} disabled={past.length === 0}>{text.undo}</button>
              <button className="project-action-button history-action" onClick={redo} disabled={future.length === 0}>{text.redo}</button>
            </div>
            <div className="topbar-actions export-actions">
              {outputMode === 'three-d' && <button
                  type="button"
                  className="export-action-button primary-action"
                  title={text.exportThreeMf}
                  disabled={exportDisabled}
                  onClick={exportThreeMf}
                >
                  <ExportIcon />
                  <span>{text.exportThreeMf}</span>
                </button>}
              <div className="print-export-menu">
                <button
                  ref={printExportButtonRef}
                  type="button"
                  className={`export-action-button print-export-button${outputMode === 'pattern' ? ' primary-action' : ''}`}
                  title={`${text.exportPatternTitle} PNG`}
                  aria-expanded={showPrintExportPanel}
                  aria-haspopup="dialog"
                  aria-controls="print-export-dialog"
                  disabled={exportDisabled}
                  onClick={() => showPrintExportPanel ? closePrintExportPanel() : setShowPrintExportPanel(true)}
                >
                  <ExportIcon />
                  <span>{text.exportPatternFull}</span>
                </button>
                {showPrintExportPanel && (
                  <div
                    id="print-export-dialog"
                    className="print-export-popover"
                    role="dialog"
                    aria-labelledby="print-export-dialog-title"
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      event.preventDefault();
                      event.stopPropagation();
                      closePrintExportPanel();
                    }}
                  >
                    <div className="print-export-popover-header">
                      <strong id="print-export-dialog-title">{text.printExportSettings}</strong>
                      <button
                        className="print-export-close"
                        type="button"
                        aria-label={text.close}
                        title={text.close}
                        onClick={closePrintExportPanel}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                    <label className="export-text-field">
                      <span>{text.exportFormat}</span>
                      <select
                        autoFocus
                        className="export-format-select"
                        value={printExportOptions.format ?? 'png'}
                        onChange={(event) => setPrintExportOptions((current) => ({ ...current, format: event.target.value as 'png' | 'pdf' }))}
                      >
                        <option value="png">PNG</option>
                        <option value="pdf">PDF</option>
                      </select>
                    </label>
                    <label className="export-text-field">
                      <span>{text.exportBounds}</span>
                      <select
                        className="export-format-select"
                        value={printExportOptions.exportBounds ?? 'pattern'}
                        onChange={(event) => setPrintExportOptions((current) => ({ ...current, exportBounds: event.target.value as 'pattern' | 'canvas' }))}
                      >
                        <option value="pattern">{text.exportPatternBounds}</option>
                        <option value="canvas">{text.exportCanvasBounds}</option>
                      </select>
                    </label>
                    <label className="export-text-field">
                      <span>{text.projectNickname}</span>
                      <input
                        value={project.name}
                        maxLength={80}
                        onFocus={commitHistory}
                        onChange={(event) => updateProject({ ...project, name: event.target.value }, 'settings')}
                        onBlur={() => {
                          if (!project.name.trim()) updateProject({ ...project, name: 'Untitled Pattern' }, 'settings');
                        }}
                      />
                    </label>
                    <label className="export-text-field">
                      <span>{text.authorNickname}</span>
                      <input
                        value={printExportOptions.authorName ?? ''}
                        placeholder={text.optional}
                        onChange={(event) => setPrintExportOptions((current) => ({ ...current, authorName: event.target.value }))}
                      />
                    </label>
                    <label className="switch-row">
                      <span>{text.showColorCodes}</span>
                      <input
                        type="checkbox"
                        checked={printExportOptions.showColorCodes}
                        onChange={(event) => setPrintExportOptions((current) => ({ ...current, showColorCodes: event.target.checked }))}
                      />
                    </label>
                    <label className="switch-row">
                      <span>{text.showGuideLines}</span>
                      <input
                        type="checkbox"
                        checked={printExportOptions.showGuideLines}
                        onChange={(event) => setPrintExportOptions((current) => ({ ...current, showGuideLines: event.target.checked }))}
                      />
                    </label>
                    <button className="export-submit-button" disabled={exportDisabled} onClick={exportPrintPattern}>
                      {text.exportNow} {(printExportOptions.format ?? 'png').toUpperCase()}
                    </button>
                  </div>
                )}
              </div>
              <button className="export-action-button" disabled={exportDisabled} title={text.exportUsageTitle} onClick={exportUsageList}>{text.exportUsageFull}</button>
              <button className="export-action-button" disabled={exportDisabled} title={text.exportRecordTitle} onClick={exportEditRecord}>{text.exportRecordFull}</button>
              <button className="export-action-button" title={text.importRecordTitle} onClick={() => jsonInputRef.current?.click()}>{text.importRecordFull}</button>
            </div>
          </div>
        </div>

        <div className="topbar-right">
          <button className="help-button" type="button" onClick={() => helpDialogRef.current?.showModal()}>{text.help}</button>
          <a
            className="github-link"
            href="https://github.com/pgp00/beadrelief"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            title="GitHub"
          >
            <GitHubIcon />
            <span>GitHub</span>
          </a>
          <div className="language-toggle" aria-label={text.language}>
            <button className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>中</button>
            <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
        </div>
      </header>

      <aside className="left-panel">
        <section className="left-card output-mode-card">
          <div className="left-card-header">
            <div>
              <strong>{text.outputMode}</strong>
              <span>{outputMode === 'pattern' ? text.patternModeHint : text.threeDModeHint}</span>
            </div>
          </div>
          <div className="output-mode-toggle" role="group" aria-label={text.outputMode}>
            <button
              type="button"
              className={outputMode === 'pattern' ? 'active' : ''}
              aria-pressed={outputMode === 'pattern'}
              onClick={() => selectOutputMode('pattern')}
            >
              {text.patternMode}
            </button>
            <button
              type="button"
              className={outputMode === 'three-d' ? 'active' : ''}
              aria-pressed={outputMode === 'three-d'}
              onClick={() => selectOutputMode('three-d')}
            >
              {text.threeDMode}
            </button>
          </div>
        </section>

        <section className="left-card image-card">
          <div className="left-card-header">
            <div>
              <strong className="field-label-with-help">
                {text.imageToPattern}
                <span className="help-dot image-help-dot" {...imageHelpProps(text.autoGenerateHint)}>?</span>
              </strong>
            </div>
            <small>{pendingFile ? text.ready : text.noImage}</small>
          </div>

          {imageLaunch.showActions ? (
            <div className="image-empty-actions">
              <p>{text.quickStartHint}</p>
              <button className="project-action-button primary-action" type="button" onClick={() => void startHeartSample().catch(() => setNotice(codedUiError('SAMPLE_LOAD', text.sampleLoadError)))}>
                {text.trySample}
              </button>
              <button className="project-action-button" type="button" onClick={() => fileInputRef.current?.click()}>
                {text.uploadYourImage}
              </button>
            </div>
          ) : (
            <button className={pendingImageUrl ? `upload-zone has-image${isGenerating ? ' is-generating' : ''}` : `upload-zone${isGenerating ? ' is-generating' : ''}`} type="button" onClick={() => fileInputRef.current?.click()}>
              {pendingImageUrl && <img src={pendingImageUrl} alt="" />}
              <span className="upload-zone-text">
                <strong>{isGenerating ? text.preparingPattern : pendingFile ? pendingFile.name : text.uploadImage}</strong>
                <span>{isGenerating ? pendingFile?.name : pendingFile ? 'PNG / JPG / WebP' : 'PNG, JPG, WebP'}</span>
              </span>
            </button>
          )}

          {pendingFile && manualEditsSinceGeneration && (
            <button className="project-action-button primary-action" type="button" disabled={isGenerating} onClick={() => void generateFromImage({ recordHistory: true })}>
              {text.regenerateFromImage}
            </button>
          )}

          <div className="image-field-grid">
            <label className="image-number-field">
              <span className="field-label-with-help">
                {text.width}
                <span className="help-dot image-help-dot" {...imageHelpProps(text.heightFromRatio)}>?</span>
              </span>
              <input aria-label={text.outputLongSide} type="number" min={8} max={outputMode === 'pattern' ? MAX_PROJECT_DIMENSION : MAX_PRINT_WORKSPACE_DIMENSION} value={convertWidth} onChange={(event) => updateImportSetting('width', Number(event.target.value))} />
            </label>
            {outputMode === 'pattern' && <label className="image-range-field">
              <span>
                <span className="field-label-with-help">
                  {text.colors}
                  <span className="help-dot image-help-dot" {...imageHelpProps(text.colorsHint)}>?</span>
                </span>
                <strong>{patternColorLimit}</strong>
              </span>
              <input aria-label={text.patternColorLimit} type="range" min={1} max={activePalette.length} value={patternColorLimit} onChange={(event) => {
                markGenerationPending();
                setPatternColorLimit(Number(event.target.value));
              }} />
            </label>}
            {backgroundMode === 'remove-white' && <label className="image-range-field">
              <span>
                <span className="field-label-with-help">
                  {text.tolerance}
                  <span className="help-dot image-help-dot" {...imageHelpProps(text.toleranceHint)}>?</span>
                </span>
                <strong>{tolerance}</strong>
              </span>
              <input aria-label={text.backgroundTolerance} type="range" min={0} max={120} step={1} value={tolerance} onChange={(event) => updateImportSetting('tolerance', Number(event.target.value))} />
            </label>}
          </div>

          <label className="stacked-field image-style-field">
            <span>{text.generationStyle}</span>
            <select
              aria-label={text.generationStyle}
              value={generationStyle}
              onChange={(event) => updateImportSetting('generationStyle', event.target.value as GenerationStyle)}
            >
              <option value="pixel">{text.generationStylePixel}</option>
              <option value="cartoon">{text.generationStyleCartoon}</option>
              <option value="realistic">{text.generationStyleRealistic}</option>
            </select>
          </label>

          {pendingFile && <details className="image-crop-controls">
            <summary>{text.cropImage}</summary>
            <label className="stacked-field">
              <span>{text.cropAspect}</span>
              <select aria-label={text.cropAspect} value={cropAspect} onChange={(event) => updateImportSetting('cropAspect', event.target.value as CropAspect)}>
                <option value="original">{text.cropOriginal}</option>
                <option value="square">{text.cropSquare}</option>
                <option value="portrait">{text.cropPortrait}</option>
                <option value="landscape">{text.cropLandscape}</option>
              </select>
            </label>
            <label className="image-range-field">
              <span><span>{text.cropZoom}</span><strong>{cropZoom.toFixed(1)}×</strong></span>
              <input aria-label={text.cropZoom} type="range" min={1} max={3} step={0.1} value={cropZoom} onChange={(event) => updateImportSetting('cropZoom', Number(event.target.value))} />
            </label>
            <div className="image-field-grid">
              <label className="image-range-field">
                <span><span>{text.cropHorizontal}</span><strong>{Math.round(cropOffsetX * 100)}</strong></span>
                <input aria-label={text.cropHorizontal} type="range" min={-1} max={1} step={0.05} value={cropOffsetX} onChange={(event) => updateImportSetting('cropOffsetX', Number(event.target.value))} />
              </label>
              <label className="image-range-field">
                <span><span>{text.cropVertical}</span><strong>{Math.round(cropOffsetY * 100)}</strong></span>
                <input aria-label={text.cropVertical} type="range" min={-1} max={1} step={0.05} value={cropOffsetY} onChange={(event) => updateImportSetting('cropOffsetY', Number(event.target.value))} />
              </label>
            </div>
          </details>}

          <label className="stacked-field image-background-field">
            <span>{text.background}</span>
            <select aria-label={text.background} value={backgroundMode} onChange={(event) => updateImportSetting('backgroundMode', event.target.value as BackgroundMode)}>
              <option value="keep">{text.keepBackground}</option>
              <option value="remove-white">{text.removeWhite}</option>
            </select>
          </label>

          {pendingFile && <div className="conversion-summary" aria-label={text.conversionSummary}>
            <strong>{project.width} × {project.height}</strong>
            <span>{text.conversionSummaryText(usage.length, totalBeads, isolatedBeads)}</span>
          </div>}
        </section>

        {outputMode === 'three-d' && <section className="left-card material-profile-card">
          <div className="left-card-header">
            <div>
              <strong>{text.materialProfile}</strong>
              <span>{project.materialProfile.verified ? text.profileVerified : text.profileUnverified}</span>
            </div>
          </div>
          <label className="stacked-field">
            <span>{text.profileName}</span>
            <input value={project.materialProfile.name} maxLength={80} onFocus={commitHistory} onChange={(event) => patchMaterialProfile({ name: event.target.value })} />
          </label>
          <label className="stacked-field">
            <span>{text.printer}</span>
            <input value={project.materialProfile.printer} maxLength={80} onFocus={commitHistory} onChange={(event) => patchMaterialProfile({ printer: event.target.value }, true)} />
          </label>
          <div className="image-field-grid">
            <label className="stacked-field">
              <span>{text.nozzle}</span>
              <select value={project.materialProfile.nozzleDiameterMm} onFocus={commitHistory} onChange={(event) => patchMaterialProfile({ nozzleDiameterMm: Number(event.target.value) as 0.2 | 0.4 | 0.6 | 0.8 }, true)}>
                {[0.2, 0.4, 0.6, 0.8].map((value) => <option key={value} value={value}>{value} mm</option>)}
              </select>
            </label>
            <label className="stacked-field">
              <span>{text.profileLayerHeight}</span>
              <input type="number" min={0.04} max={0.4} step={0.01} disabled={project.printSettings.mode === 'layered'} value={project.materialProfile.layerHeightMm} onFocus={commitHistory} onChange={(event) => patchMaterialProfile({ layerHeightMm: Number(event.target.value) }, true)} />
            </label>
          </div>
          <label className="switch-row">
            <span>{text.physicallyVerified}</span>
            <input type="checkbox" checked={project.materialProfile.verified} disabled={!project.materialProfile.verified && !calibrationComplete} onChange={(event) => {
              commitHistory();
              patchMaterialProfile({ verified: event.target.checked });
            }} />
          </label>
          {project.amsColors.length >= 2 && <details className="calibration-panel">
            <summary>
              {text.calibrationTitle}
              {' '}({project.materialProfile.measuredColors.length}/{calibrationPalette.length})
            </summary>
            <p>{text.calibrationDescription}</p>
            <button type="button" onClick={() => void exportCalibrationThreeMf()}>
              {text.downloadCalibration}
            </button>
            {project.materialProfile.measuredColors.length > 0 && <button type="button" onClick={() => {
              commitHistory();
              patchMaterialProfile({}, true);
            }}>
              {text.clearMeasuredColors}
            </button>}
            <div className="calibration-colors">
              {calibrationPalette.map((color) => (
                <label key={color.stopLevel}>
                  <span>L{color.stopLevel}</span>
                  <input
                    type="color"
                    aria-label={text.measuredColor(color.stopLevel)}
                    value={project.materialProfile.measuredColors.find((item) => item.stopLevel === color.stopLevel)?.hex ?? color.hex}
                    onChange={(event) => setMeasuredStackColor(color.stopLevel, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </details>}
          <div className="profile-actions">
            <button type="button" onClick={() => profileInputRef.current?.click()}>{text.importProfile}</button>
            <button type="button" onClick={() => {
              downloadMaterialProfile(project);
              setNotice(text.profileExported);
            }}>{text.exportProfile}</button>
          </div>
        </section>}

        {outputMode === 'three-d' && <PrintSettingsPanel
          project={project}
          model={printableModel!}
          errors={printErrors}
          language={language}
          onChange={updatePrintProject}
          onCommit={commitHistory}
          onExport={exportThreeMf}
          exportDisabled={exportDisabled}
        />}

        <section className="left-card reference-card">
          <div className="left-card-header">
            <div>
              <strong>{text.referenceImage}</strong>
              <span>{text.referenceHint}</span>
            </div>
            <small>{referenceImageUrl ? text.ready : text.noImage}</small>
          </div>

          <button className={referenceImageUrl ? 'upload-zone reference-upload-zone has-image' : 'upload-zone reference-upload-zone'} onClick={() => referenceInputRef.current?.click()}>
            {referenceImageUrl && <img src={referenceImageUrl} alt="" />}
            <span className="upload-zone-text">
              <strong>{referenceFile ? referenceFile.name : text.uploadReferenceImage}</strong>
              <span>{referenceFile ? 'PNG / JPG / WebP' : 'PNG, JPG, WebP'}</span>
            </span>
          </button>

          <label className="switch-row reference-switch">
            <span>{text.showReferenceImage}</span>
            <input
              type="checkbox"
              checked={referenceVisible}
              disabled={!referenceImageUrl}
              onChange={(event) => setReferenceVisible(event.target.checked)}
            />
          </label>

          <label className="image-range-field reference-opacity-field">
            <span>
              <span>{text.referenceOpacity}</span>
              <strong>{Math.round(referenceOpacity * 100)}%</strong>
            </span>
            <input
              aria-label={text.referenceOpacityControl}
              type="range"
              min={0.1}
              max={0.95}
              step={0.05}
              value={referenceOpacity}
              disabled={!referenceImageUrl || !referenceVisible}
              onChange={(event) => setReferenceOpacity(Number(event.target.value))}
            />
          </label>

          <div className="reference-adjust-row">
            <label className="switch-row reference-switch">
              <span>{text.referenceAdjust}</span>
              <input
                type="checkbox"
                checked={referenceAdjusting}
                disabled={!referenceImageUrl || !referenceVisible}
                onChange={(event) => setReferenceAdjusting(event.target.checked)}
              />
            </label>
            <button
              type="button"
              className="reference-reset-button"
              disabled={!referenceImageUrl}
              onClick={resetReferenceTransform}
            >
              {text.resetReferenceTransform}
            </button>
          </div>

          <div className="reference-control-grid">
            <label className="stacked-field reference-placement-field">
              <span>{text.referencePlacement}</span>
              <div className="reference-placement-toggle" aria-label={text.referencePlacement}>
                <button
                  type="button"
                  className={referencePlacement === 'below' ? 'active' : ''}
                  disabled={!referenceImageUrl}
                  aria-pressed={referencePlacement === 'below'}
                  onClick={() => setReferencePlacement('below')}
                >
                  {text.referenceBelow}
                </button>
                <button
                  type="button"
                  className={referencePlacement === 'above' ? 'active' : ''}
                  disabled={!referenceImageUrl}
                  aria-pressed={referencePlacement === 'above'}
                  onClick={() => setReferencePlacement('above')}
                >
                  {text.referenceAbove}
                </button>
              </div>
            </label>
          </div>
        </section>
      </aside>

      <aside className="tool-rail">
        {tools.map((toolId) => (
          <button
            key={toolId}
            className={tool === toolId ? 'tool-button active' : 'tool-button'}
            aria-label={text.tools[toolId].title}
            aria-pressed={tool === toolId}
            type="button"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse') return;
              event.preventDefault();
              activateTool(toolId);
            }}
            onClick={() => activateTool(toolId)}
          >
            <ToolIcon tool={toolId} />
            <span>{text.tools[toolId].title}</span>
          </button>
        ))}
        {tool === 'pencil' && openToolOptions === 'pencil' && (
          <div className="tool-options pencil-options" onMouseLeave={() => setOpenToolOptions(null)}>
            <div className="right-click-toggle compact" aria-label={text.rightClick}>
              <span className="field-label-with-help">
                {text.rightClick}
                <span className="help-dot mini" data-tooltip={text.rightClickHint} aria-label={text.rightClickHint} tabIndex={0}>?</span>
              </span>
              <div>
                {(['pan', 'erase'] as RightClickAction[]).map((action) => (
                  <button
                    key={action}
                    className={project.settings.rightClickAction === action ? 'active' : ''}
                    type="button"
                    aria-pressed={project.settings.rightClickAction === action}
                    onClick={() =>
                      updateProject({
                        ...project,
                        settings: { ...project.settings, rightClickAction: action },
                      })
                    }
                  >
                    {action === 'pan' ? text.pan : text.erase}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {tool === 'eraser' && openToolOptions === 'eraser' && (
          <div className="tool-options eraser-options" onMouseLeave={() => setOpenToolOptions(null)}>
            <div className="tool-options-header">
              <span>{text.eraserSize}</span>
              <strong>{text.brushCells(eraserSize)}</strong>
            </div>
            <div className="brush-preview" aria-hidden="true">
              {eraserSize > 0 ? (
                <span style={{ width: `${10 + eraserSize * 3}px`, height: `${10 + eraserSize * 3}px` }} />
              ) : (
                <span className="brush-preview-dot" />
              )}
            </div>
            <input
              aria-label={text.eraserSize}
              type="range"
              min={0}
              max={9}
              step={0.5}
              value={eraserSize}
              onChange={(event) => setEraserSize(Number(event.target.value))}
            />
          </div>
        )}
        {tool === 'remove' && openToolOptions === 'remove' && (
          <div className="tool-options remove-options" onMouseLeave={() => setOpenToolOptions(null)}>
            <div className="right-click-toggle compact remove-scope-toggle" aria-label={text.removeScope}>
              <span>{text.removeScope}</span>
              <div>
                {(['same-connected', 'all-same-color', 'connected'] as RemoveMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={removeMode === mode ? 'active' : ''}
                    type="button"
                    aria-pressed={removeMode === mode}
                    onClick={() => setRemoveMode(mode)}
                  >
                    {mode === 'same-connected'
                      ? text.removeSameConnected
                      : mode === 'all-same-color'
                        ? text.removeAllSameColor
                        : text.removeConnected}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {tool === 'move' && openToolOptions === 'move' && (
          <div className="tool-options move-options" onMouseLeave={() => setOpenToolOptions(null)}>
            <div className="right-click-toggle compact" aria-label={text.moveScope}>
              <span>{text.moveScope}</span>
              <div>
                {(['layer', 'partial'] as MoveMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={moveMode === mode ? 'active' : ''}
                    type="button"
                    aria-pressed={moveMode === mode}
                    onClick={() => setMoveMode(mode)}
                  >
                    {mode === 'layer' ? text.moveLayer : text.movePartial}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {(tool === 'copy' || tool === 'paste') && openToolOptions === tool && (
          <div
            className={`tool-options clipboard-options ${tool === 'copy' ? 'copy-options' : 'paste-options'}`}
            onMouseLeave={() => setOpenToolOptions(null)}
          >
            {tool === 'copy' && (
              <div className="right-click-toggle compact clipboard-mode-toggle" aria-label={text.copyScope}>
                <span>{text.copyScope}</span>
                <div>
                  {(['connected', 'selection'] as CopyMode[]).map((mode) => (
                    <button
                      key={mode}
                      className={copyMode === mode ? 'active' : ''}
                      type="button"
                      aria-pressed={copyMode === mode}
                      onClick={() => {
                        setCopyMode(mode);
                        setCopySelectionIndices([]);
                      }}
                    >
                      {mode === 'connected' ? text.copyConnected : text.copySelection}
                    </button>
                  ))}
                </div>
                {copyMode === 'selection' && <p className="tool-hint compact-hint">{text.copySelectionHint}</p>}
              </div>
            )}
            <div className="clipboard-tool-header">
              <div>
                <strong>{text.clipboardPreview}</strong>
                {clipboardPattern && (
                  <span>{text.clipboardSize(clipboardPattern.width, clipboardPattern.height, clipboardPattern.cells.filter(Boolean).length)}</span>
                )}
              </div>
              <button
                className="clipboard-reset-button"
                type="button"
                aria-label={text.resetClipboard}
                title={text.resetClipboard}
                disabled={!clipboardPattern && copySelectionIndices.length === 0}
                onClick={resetClipboard}
              >
                <ResetIcon />
              </button>
            </div>
            {clipboardPattern ? (
              <ClipboardPreview pattern={clipboardPattern} />
            ) : (
              <div className="clipboard-empty">{text.clipboardEmpty}</div>
            )}
          </div>
        )}
        {tool === 'mirror' && openToolOptions === 'mirror' && (
          <div className="tool-options mirror-options" onMouseLeave={() => setOpenToolOptions(null)}>
            <div className="right-click-toggle compact" aria-label={text.moveScope}>
              <span>{text.moveScope}</span>
              <div>
                {(['layer', 'partial'] as MoveMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={mirrorMode === mode ? 'active' : ''}
                    type="button"
                    aria-pressed={mirrorMode === mode}
                    onClick={() => setMirrorMode(mode)}
                  >
                    {mode === 'layer' ? text.moveLayer : text.movePartial}
                  </button>
                ))}
              </div>
            </div>
            <div className="right-click-toggle compact" aria-label={text.mirrorDirection}>
              <span>{text.mirrorDirection}</span>
              <div>
                {(['horizontal', 'vertical'] as MirrorDirection[]).map((direction) => (
                  <button
                    key={direction}
                    className={mirrorDirection === direction ? 'active' : ''}
                    type="button"
                    aria-pressed={mirrorDirection === direction}
                    onClick={() => setMirrorDirection(direction)}
                  >
                    {direction === 'horizontal' ? text.mirrorHorizontal : text.mirrorVertical}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {tool === 'shape' && openToolOptions === 'shape' && (
          <div className="tool-options shape-options" onMouseLeave={() => setOpenToolOptions(null)}>
            <div className="right-click-toggle compact" aria-label={text.shapeStyle}>
              <span>{text.shapeStyle}</span>
              <div>
                {(['outline', 'filled'] as ShapeFillMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={shapeFillMode === mode ? 'active' : ''}
                    type="button"
                    aria-pressed={shapeFillMode === mode}
                    disabled={shapeKind === 'line' || shapeKind === 'arrow'}
                    onClick={() => setShapeFillMode(mode)}
                  >
                    {mode === 'outline' ? text.shapeOutline : text.shapeFilled}
                  </button>
                ))}
              </div>
            </div>
            <div className="shape-picker" aria-label={text.shapeType}>
              <span>{text.shapeType}</span>
              <div>
                {(['line', 'rectangle', 'square', 'ellipse', 'circle', 'triangle', 'arrow'] as ShapeKind[]).map((kind) => (
                  <button
                    key={kind}
                    className={shapeKind === kind ? 'active' : ''}
                    type="button"
                    aria-pressed={shapeKind === kind}
                    onClick={() => setShapeKind(kind)}
                  >
                    <ShapeOptionIcon shape={kind} />
                    <span>{shapeLabel[kind]}</span>
                  </button>
                ))}
              </div>
            </div>
            {shapeKind === 'arrow' && (
              <div className="shape-picker arrow-picker" aria-label={text.arrowStyle}>
                <span>{text.arrowStyle}</span>
                <div>
                  {(['single', 'double', 'block'] as ArrowKind[]).map((kind) => (
                    <button
                      key={kind}
                      className={arrowKind === kind ? 'active' : ''}
                      type="button"
                      aria-pressed={arrowKind === kind}
                      onClick={() => setArrowKind(kind)}
                    >
                      <ArrowOptionIcon arrow={kind} />
                      <span>{arrowLabel[kind]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {tool === 'text' && openToolOptions === 'text' && (
          <div className="tool-options text-options">
            <label className="text-tool-field">
              <span className="text-field-title">
                {text.textContent}
                <button
                  className="tool-options-close"
                  type="button"
                  aria-label={text.close}
                  title={text.close}
                  onClick={() => setOpenToolOptions(null)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 7l10 10" />
                    <path d="M17 7L7 17" />
                  </svg>
                </button>
              </span>
              <input
                type="text"
                maxLength={32}
                value={textToolValue}
                placeholder={text.textPlaceholder}
                onChange={(event) => setTextToolValue(event.target.value)}
              />
            </label>
            <div className="right-click-toggle compact" aria-label={text.textDirection}>
              <span>{text.textDirection}</span>
              <div>
                {(['horizontal', 'vertical'] as TextDirection[]).map((direction) => (
                  <button
                    key={direction}
                    className={textToolDirection === direction ? 'active' : ''}
                    type="button"
                    aria-pressed={textToolDirection === direction}
                    onClick={() => setTextToolDirection(direction)}
                  >
                    {direction === 'horizontal' ? text.textHorizontal : text.textVertical}
                  </button>
                ))}
              </div>
            </div>
            <div className="tool-options-header">
              <span>{text.textSize}</span>
              <label className="tool-number-field" aria-label={text.textSize}>
                <input
                  type="number"
                  min={5}
                  max={72}
                  step={1}
                  value={textToolSize}
                  onChange={(event) => setTextToolSize(Math.min(72, Math.max(5, Number(event.target.value) || 5)))}
                />
                <span>{text.cellUnit}</span>
              </label>
            </div>
            <input
              aria-label={text.textSize}
              type="range"
              min={5}
              max={72}
              step={1}
              value={textToolSize}
              onChange={(event) => setTextToolSize(Number(event.target.value))}
            />
            <div className="tool-options-header">
              <span>{text.textSpacing}</span>
              <label className="tool-number-field" aria-label={text.textSpacing}>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={1}
                  value={textToolSpacing}
                  onChange={(event) => setTextToolSpacing(Math.min(24, Math.max(0, Number(event.target.value) || 0)))}
                />
                <span>{text.cellUnit}</span>
              </label>
            </div>
            <input
              aria-label={text.textSpacing}
              type="range"
              min={0}
              max={24}
              step={1}
              value={textToolSpacing}
              onChange={(event) => setTextToolSpacing(Number(event.target.value))}
            />
          </div>
        )}
        {tool === 'pan' && openToolOptions === 'pan' && (
          <div className="tool-options pan-options" onMouseLeave={() => setOpenToolOptions(null)}>
            <div className="tool-options-header">
              <strong>{text.tools.pan.title}</strong>
            </div>
            <p className="tool-hint">{text.panToolHint}</p>
          </div>
        )}
      </aside>

      <WorkspaceCanvas
        project={displayProject}
        selectedColorId={selectedColorId}
        highlightedColorId={highlightedColorId}
        highlightedCellIndices={isolatedCellIndices}
        formatColorCode={displayCodeById}
        tool={tool}
        eraserSize={eraserSize}
        moveMode={moveMode}
        removeMode={removeMode}
        mirrorMode={mirrorMode}
        mirrorDirection={mirrorDirection}
        shapeKind={shapeKind}
        shapeFillMode={shapeFillMode}
        arrowKind={arrowKind}
        textToolValue={textToolValue}
        textToolDirection={textToolDirection}
        textToolSize={textToolSize}
        textToolSpacing={textToolSpacing}
        onTextToolSizeChange={setTextToolSize}
        referenceImageUrl={referenceImageUrl}
        referenceImageVisible={referenceVisible && !isGenerating}
        referenceImageOpacity={referenceOpacity}
        referenceImageScale={referenceScale}
        referenceImageOffset={referenceOffset}
        referenceImageAdjusting={referenceAdjusting && referenceVisible && !isGenerating}
        referenceImagePlacement={referencePlacement}
        referenceAdjustHint={text.referenceAdjustHint}
        canvasLabel={text.canvasKeyboardLabel}
        coordinateLabel={text.cursorCoordinate}
        onReferenceOffsetChange={setReferenceOffset}
        onReferenceScaleChange={setReferenceScale}
        onCommitStart={() => {
          setOpenToolOptions(tool === 'text' ? 'text' : null);
          commitHistory();
        }}
        onCellsChange={updateCells}
        onReplaceColor={replaceColor}
        clipboardPattern={clipboardPattern}
        copyMode={copyMode}
        copySelectionIndices={copySelectionIndices}
        onCopyPattern={(pattern, switchToPaste = true) => {
          const beads = pattern.cells.filter(Boolean).length;
          setClipboardPattern(pattern);
          if (switchToPaste) setTool('paste');
          setOpenToolOptions(null);
          setNotice(text.copiedPattern(pattern.width, pattern.height, beads));
        }}
        onCopySelectionChange={(indices, pattern) => {
          setCopySelectionIndices(indices);
          setClipboardPattern(pattern);
          setNotice(pattern ? text.copySelectionUpdated(pattern.cells.filter(Boolean).length) : text.clipboardReset);
        }}
        onPastePattern={() => setNotice(text.pastedPattern)}
        onPickColor={(colorId) => {
          selectColor(colorId);
          setTool('pencil');
          setOpenToolOptions(null);
          setNotice(text.pickedColor);
        }}
        onHover={setHoverCell}
        fitLabel={text.fit}
        zoomLabel={text.zoomControls}
        canEdit={canEditActiveLayer}
        lockedHint={activeLayer.locked ? text.lockedCanvasHint : text.hiddenCanvasHint}
      />

      <aside className="right-panel">
        <div
          className="right-tabs"
          role="tablist"
          aria-label={text.rightPanel}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
            const current = tabs.indexOf(event.target as HTMLButtonElement);
            if (current < 0) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0
              : event.key === 'End' ? tabs.length - 1
                : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next].click();
            tabs[next].focus();
          }}
        >
          {(Object.keys(rightTabLabel) as Array<keyof typeof rightTabLabel>).map((tab) => (
            <button
              id={`right-tab-${tab}`}
              key={tab}
              className={rightTab === tab ? 'active' : ''}
              role="tab"
              aria-controls={`right-panel-${tab}`}
              aria-selected={rightTab === tab}
              tabIndex={rightTab === tab ? 0 : -1}
              onClick={() => setRightTab(tab)}
            >
              {rightTabLabel[tab]}
            </button>
          ))}
        </div>

        <section className="panel-section status-section">
          <div>
            <strong role="status" aria-label={text.workspaceStatus} aria-live="polite" aria-atomic="true">{notice}</strong>
            <span role="status" aria-label={text.draftSaveStatus} aria-live="polite" aria-atomic="true">{draftSaveFailed ? text.storageUnavailable : ''}</span>
            <span>
              {text.panelStatus(project.width, project.height, usage.length, totalBeads, boardCount)}
            </span>
          </div>
          <span className="status-pill">{text.tools[tool].title}</span>
        </section>

        <section className="left-card preview-card right-preview-card">
          <div className="left-card-header">
            <div>
              <strong>{outputMode === 'pattern' ? text.beadPreview : text.preview3d}</strong>
              <span>{outputMode === 'pattern' ? text.liveBeadPreview : text.liveBoard}</span>
            </div>
            <small>{outputMode === 'pattern' ? totalBeads : previewProject.width * previewProject.height} {text.cellUnit}</small>
          </div>
          {outputMode === 'pattern' ? (
            <ThreePreview
              project={previewDisplayProject}
              title={text.beadPreview}
              emptyLabel={text.previewEmpty}
              closeLabel={text.close}
              expandLabel={text.expandPreview}
              webglErrorLabel={text.webglUnavailable}
              previewLayerLabel={text.previewLayerControl}
              singleLayerLabel={text.singleLayer}
              explodedLabel={text.explodedView}
            />
          ) : (
            <ThreePreview
              model={printableModel!}
              title={text.preview3d}
              emptyLabel={text.previewEmpty}
              closeLabel={text.close}
              expandLabel={text.expandPreview}
              webglErrorLabel={text.webglUnavailable}
              previewLayerLabel={text.previewLayerControl}
              singleLayerLabel={text.singleLayer}
              explodedLabel={text.explodedView}
            />
          )}
        </section>

        {rightTab === 'palette' && (
          <section id="right-panel-palette" className="panel-section panel-tab-body palette-section" role="tabpanel" aria-labelledby="right-tab-palette">
            <h2>{text.palette}</h2>
            <div className="palette-selected-card">
              <span style={{ backgroundColor: selectedColor?.hex }} />
              <div className="palette-selected-main">
                <strong>{selectedColor ? displayCode(selectedColor) : ''}</strong>
                <small>{selectedColor ? displayName(selectedColor) : ''}</small>
              </div>
              <div className="palette-selected-hex">
                <small>{selectedColor?.hex}</small>
              </div>
            </div>
            {outputMode === 'pattern' && <div className="readonly-brand-field">
              {text.brandCodes}
              <select value={paletteMode} onChange={(event) => {
                const next = event.target.value as PaletteMode;
                setPaletteMode(next);
                setPatternColorLimit((current) => Math.min(current, next === 'basic' ? basicPalette.length : completePalette.length));
              }}>
                <option value="basic">{text.mardBasic}</option>
                <option value="complete">{text.mardComplete}</option>
              </select>
            </div>}
            <div className="recent-colors-field">
              <span>{text.recentColors}</span>
              <div className="recent-color-row">
                {recentColors.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    className={selectedColorId === color.id ? 'active' : ''}
                    title={`${displayCode(color)} ${displayName(color)}`}
                    aria-label={`${text.recentColors} ${displayCode(color)}`}
                    onClick={() => selectColor(color.id, { updateRecent: false })}
                  >
                    <span style={{ backgroundColor: color.hex }} />
                    <small>{displayCode(color)}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="palette-filter" aria-label={text.paletteGroups}>
              {paletteGroups.map((group) => (
                <button
                  key={group.id}
                  className={paletteGroup === group.id ? 'active' : ''}
                  onClick={() => setPaletteGroup(group.id)}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="palette-grid">
              <PaletteGrid colors={visiblePalette} selectedColorId={selectedColorId} onSelect={selectColor} />
            </div>
          </section>
        )}

        {rightTab === 'layers' && (
          <section id="right-panel-layers" className="panel-section panel-tab-body layers-section" role="tabpanel" aria-labelledby="right-tab-layers">
            <div className="layers-header">
              <h2>{text.layers}</h2>
              <button
                disabled={!hasLayerCapacity(layers.length)}
                title={!hasLayerCapacity(layers.length) ? text.layerLimitReached : undefined}
                onClick={addLayer}
              >{text.addLayer}</button>
            </div>
            <button
              className={project.settings.showActiveLayerOnly ? 'layer-solo-toggle active' : 'layer-solo-toggle'}
              type="button"
              aria-pressed={project.settings.showActiveLayerOnly}
              onClick={toggleActiveLayerOnly}
            >
              <EyeIcon visible={project.settings.showActiveLayerOnly} />
              <span>{text.showActiveLayerOnly}</span>
            </button>
            <div
              className="layer-list"
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTarget(null);
              }}
            >
              {[...layers].reverse().map((layer) => {
                const layerIndex = layers.findIndex((item) => item.id === layer.id);
                const isActive = layer.id === activeLayer.id;
                const beadCount = layer.cells.filter(Boolean).length;
                const displayName = layerDisplayName(layer, layerIndex);
                const rowClassName = [
                  'layer-row',
                  isActive ? 'active' : '',
                  draggingLayerId === layer.id ? 'dragging' : '',
                  dragTarget?.id === layer.id && draggingLayerId !== layer.id ? `drag-over-${dragTarget.edge}` : '',
                ].filter(Boolean).join(' ');
                return (
                  <div
                    key={layer.id}
                    className={rowClassName}
                    onDragOver={(event) => {
                      if (!draggingLayerId || draggingLayerId === layer.id) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      const nextTarget = dragTargetFromEvent(event, layer.id);
                      setDragTarget((current) =>
                        current?.id === nextTarget.id && current.edge === nextTarget.edge ? current : nextTarget,
                      );
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = event.dataTransfer.getData('text/plain') || draggingLayerId;
                      const nextTarget = dragTargetFromEvent(event, layer.id);
                      setDraggingLayerId(null);
                      setDragTarget(null);
                      if (sourceId) moveLayer(sourceId, nextTarget);
                    }}
                  >
                    <button
                      className="layer-drag-handle"
                      draggable
                      title={text.reorderLayer}
                      aria-label={text.reorderLayer}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', layer.id);
                        const dragImage = document.createElement('canvas');
                        dragImage.width = 1;
                        dragImage.height = 1;
                        event.dataTransfer.setDragImage(dragImage, 0, 0);
                        setDraggingLayerId(layer.id);
                      }}
                      onDragEnd={() => {
                        setDraggingLayerId(null);
                        setDragTarget(null);
                      }}
                    >
                      <DragHandleIcon />
                    </button>
                    <button
                      className={layer.visible ? 'mini-icon-toggle visibility-toggle active' : 'mini-icon-toggle visibility-toggle'}
                      title={layer.visible ? text.eye : text.hiddenLayer}
                      aria-label={layer.visible ? text.eye : text.hiddenLayer}
                      onClick={(event) => {
                        event.stopPropagation();
                        updateLayer(layer.id, { visible: !layer.visible });
                      }}
                    >
                      <EyeIcon visible={layer.visible} />
                    </button>
                    {editingLayerId === layer.id ? (
                      <form
                        className="layer-main layer-name-editor"
                        onSubmit={(event) => {
                          event.preventDefault();
                          saveEditingLayer(layer, layerIndex);
                        }}
                      >
                        <input
                          value={editingLayerName}
                          aria-label={text.renameLayer}
                          autoFocus
                          onChange={(event) => setEditingLayerName(event.target.value)}
                          onBlur={() => saveEditingLayer(layer, layerIndex)}
                          onFocus={(event) => event.currentTarget.select()}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setEditingLayerId(null);
                            }
                          }}
                        />
                        <span className="layer-meta">{layerMetaText(isActive, layer.visible, layer.locked, beadCount)}</span>
                        <label className="checkline layer-count">
                          <input
                            type="checkbox"
                            checked={layer.includeInUsage}
                            onChange={(event) => updateLayer(layer.id, { includeInUsage: event.target.checked })}
                          />
                          {text.countLayer}
                        </label>
                      </form>
                    ) : (
                      <div className="layer-main layer-main-static">
                        <div className="layer-title-row">
                          <button
                            className="layer-select-button"
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => selectLayer(layer.id)}
                          >
                            <strong>{displayName}</strong>
                            <span className="layer-meta">
                              {layerMetaText(isActive, layer.visible, layer.locked, beadCount)}
                            </span>
                          </button>
                          <button
                            className="layer-rename-button"
                            type="button"
                            title={text.renameLayer}
                            aria-label={text.renameLayer}
                            onClick={() => startEditingLayer(layer, layerIndex)}
                          >
                            <PencilIcon />
                          </button>
                        </div>
                        <label className="checkline layer-count">
                          <input
                            type="checkbox"
                            checked={layer.includeInUsage}
                            onChange={(event) => updateLayer(layer.id, { includeInUsage: event.target.checked })}
                          />
                          {text.countLayer}
                        </label>
                      </div>
                    )}
                    <div className="layer-actions">
                      <button
                        className="mini-icon-toggle"
                        disabled={layerIndex === layers.length - 1}
                        aria-label={text.moveLayerUp}
                        title={text.moveLayerUp}
                        onClick={() => moveLayerBy(layer.id, 1)}
                      >↑</button>
                      <button
                        className="mini-icon-toggle"
                        disabled={layerIndex === 0}
                        aria-label={text.moveLayerDown}
                        title={text.moveLayerDown}
                        onClick={() => moveLayerBy(layer.id, -1)}
                      >↓</button>
                      <button
                        className={layer.locked ? 'mini-icon-toggle active' : 'mini-icon-toggle'}
                        aria-label={layer.locked ? text.unlock : text.lock}
                        title={layer.locked ? text.unlockHint : text.lockHint}
                        onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                      >
                        <LockIcon locked={layer.locked} />
                      </button>
                      <button
                        className="mini-icon-toggle"
                        disabled={!hasLayerCapacity(layers.length)}
                        aria-label={text.duplicateLayer}
                        title={!hasLayerCapacity(layers.length) ? text.layerLimitReached : text.duplicateLayer}
                        onClick={() => duplicateLayer(layer.id)}
                      >
                        <DuplicateIcon />
                      </button>
                      <button
                        className="mini-icon-toggle danger"
                        disabled={layers.length <= 1}
                        aria-label={text.deleteLayer}
                        title={text.deleteLayer}
                        onClick={() => deleteLayer(layer.id)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {rightTab === 'usage' && (
          <section id="right-panel-usage" className="panel-section panel-tab-body usage-section" role="tabpanel" aria-labelledby="right-tab-usage">
            <h2>{text.usage}</h2>
            <div className="usage-overview">
              <div><span>{text.totalBeadsLabel}</span><strong>{totalBeads}</strong></div>
              <div>
                <span>{layeredOutput ? text.filaments : text.colorTypes}</span>
                <strong>{layeredOutput ? project.amsColors.length : usage.length}</strong>
              </div>
              <div>
                <span>{layeredOutput ? text.layerCells : text.estimatedPacks}</span>
                <strong>{layeredOutput
                  ? layeredUsage.reduce((sum, row) => sum + row.layerCells, 0)
                  : totalPacks}</strong>
              </div>
            </div>
            {layeredOutput && <div className="print-recipe-card">
              <div className="usage-summary-head">
                <strong>{text.printRecipe}</strong>
                <span>{text.bottomToTop}</span>
              </div>
              <div className="print-recipe-slots">
                {printRecipe!.slots.map((slot) => (
                  <div key={slot.id}>
                    <span className="usage-chip" style={{ backgroundColor: slot.hex }} />
                    <strong>AMS {slot.slot}</strong>
                    <small>{slot.name}</small>
                  </div>
                ))}
              </div>
              <div className="print-recipe-meta">
                <span>{text.recipeLayers(printRecipe!.layers.length)}</span>
                <span>{text.recipeStops(printRecipe!.stops.length)}</span>
                <span>{printRecipe!.layerHeightMm} mm</span>
              </div>
            </div>}
            {!layeredOutput && (
              <label className="usage-pack-setting">
                <span>{text.beadsPerPack}</span>
                <div className="usage-pack-control">
                  <div className="usage-pack-stepper">
                    <button type="button" onClick={() => stepBeadsPerPack(-1)}>-</button>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      step={500}
                      value={project.settings.beadsPerPack}
                      onChange={(event) => setBeadsPerPack(Number(event.target.value))}
                    />
                    <button type="button" onClick={() => stepBeadsPerPack(1)}>+</button>
                  </div>
                  <small>{text.perPackUnit}</small>
                </div>
              </label>
            )}
            <div className="usage-summary-card">
              <div className="usage-summary-head">
                <strong>{text.countedLayerTitle}</strong>
                <span>{text.countedLayers(countedLayers.length)}</span>
              </div>
              <div className="usage-layer-actions">
                <button
                  type="button"
                  className={countedLayers.length === layers.length ? 'active' : ''}
                  onClick={() => updateUsageLayerSelection(new Set(layers.map((layer) => layer.id)))}
                >
                  {text.countAllLayers}
                </button>
                <button
                  type="button"
                  className={countedLayers.length === 1 && countedLayers[0]?.id === activeLayer.id ? 'active' : ''}
                  onClick={() => updateUsageLayerSelection(new Set([activeLayer.id]))}
                >
                  {text.countCurrentLayer}
                </button>
              </div>
              <div className="usage-layer-chips">
                {layers.map((layer) => {
                  const isIncluded = layer.includeInUsage;
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      className={isIncluded ? 'active' : ''}
                      aria-pressed={isIncluded}
                      onClick={() => toggleUsageLayer(layer.id)}
                    >
                      {layerDisplayName(layer, layers.findIndex((item) => item.id === layer.id))}
                    </button>
                  );
                })}
              </div>
              {countedLayers.length === 0 && <div className="usage-no-layers">{text.noCountedLayers}</div>}
              {(usage.length > 32 || isolatedBeads > 0 || isolatedColorCount > 0) && (
                <div className="usage-notes">
                  {usage.length > 32 && <span>{text.manyColors}</span>}
                  {isolatedBeads > 0 && (
                    <span className="usage-note-line">
                      <span>{text.isolatedBeads(isolatedBeads)}</span>
                      <button
                        className={showIsolatedBeads ? 'usage-note-eye active' : 'usage-note-eye'}
                        type="button"
                        title={showIsolatedBeads ? text.hideIsolatedBeads : text.showIsolatedBeads}
                        aria-label={showIsolatedBeads ? text.hideIsolatedBeads : text.showIsolatedBeads}
                        aria-pressed={showIsolatedBeads}
                        onClick={() => setShowIsolatedBeads((current) => !current)}
                      >
                        <EyeIcon visible={showIsolatedBeads} />
                      </button>
                    </span>
                  )}
                  {isolatedColorCount > 0 && (
                    <span className="usage-note-line">
                      <span>{text.isolatedColors(isolatedColorCount)}</span>
                      <button type="button" disabled={!canEditActiveLayer} onClick={applyIsolatedColorCleanup}>
                        {text.cleanIsolatedColors}
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="usage-list">
              {layeredOutput
                ? layeredUsage.map((row) => (
                  <div className="usage-row" key={row.color.id}>
                    <span className="usage-chip" style={{ backgroundColor: row.color.hex }} />
                    <span className="usage-color-info">
                      <strong>{row.color.primaryCode}</strong>
                      <small>{row.color.name}</small>
                    </span>
                    <span className="usage-count">
                      <strong>{row.layerCells}</strong>
                      <small>{text.layerCells}</small>
                    </span>
                  </div>
                ))
                : usage.map((row) => (
                  <button
                    key={row.color.id}
                    onMouseEnter={() => setHighlightedColorId(row.color.id)}
                    onMouseLeave={() => setHighlightedColorId(null)}
                  >
                    <span className="usage-chip" style={{ backgroundColor: row.color.hex }} />
                    <span className="usage-color-info">
                      <strong>{displayCode(row.color)}</strong>
                      <small>{displayName(row.color)}</small>
                    </span>
                    <span className="usage-count">
                      <strong>{row.count}</strong>
                      <small>{row.packs} {text.packUnit}</small>
                    </span>
                  </button>
                ))}
              {usage.length === 0 && !layeredOutput && <div className="usage-empty">{text.noUsage}</div>}
            </div>
          </section>
        )}

        {rightTab === 'adjustments' && (
          <section id="right-panel-adjustments" className="panel-section panel-tab-body adjustment-section" role="tabpanel" aria-labelledby="right-tab-adjustments">
            <div className="adjustment-header">
              <h2>{text.adjustmentTitle}</h2>
              <span>{layerDisplayName(activeLayer, layers.findIndex((item) => item.id === activeLayer.id))}</span>
            </div>
            <div className="adjustment-help">{text.adjustmentHint}</div>
            {([
              ['brightness', text.brightness, -50, 50, '%'],
              ['contrast', text.contrast, -50, 50, '%'],
              ['saturation', text.saturation, -50, 50, '%'],
              ['temperature', text.temperature, -50, 50, '%'],
              ['hue', text.hue, -180, 180, 'deg'],
            ] as const).map(([key, label, min, max, unit]) => (
              <label className="adjustment-range" key={key}>
                <span>
                  <span>{label}</span>
                  <strong>{adjustments[key]}{unit}</strong>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={key === 'hue' ? 5 : 1}
                  value={adjustments[key]}
                  onChange={(event) => updateAdjustment(key, Number(event.target.value))}
                />
              </label>
            ))}
            <div className="adjustment-actions">
              <button type="button" onClick={() => resetAdjustments()} disabled={!hasAdjustments(adjustments)}>
                {text.resetAdjustments}
              </button>
            </div>
            <div className="adjustment-effect-card">
              <strong>{text.effects}</strong>
              <div className="adjustment-effect-grid">
              <button type="button" onClick={() => applyLayerEffect('invert', text.invertEffect)} disabled={!canEditActiveLayer}>
                  {text.invertEffect}
                </button>
              <button type="button" onClick={() => applyLayerEffect('grayscale', text.grayscaleEffect)} disabled={!canEditActiveLayer}>
                  {text.grayscaleEffect}
                </button>
              <button type="button" onClick={() => applyLayerEffect('blackWhite', text.blackWhiteEffect)} disabled={!canEditActiveLayer}>
                  {text.blackWhiteEffect}
                </button>
              </div>
            </div>
            <div className="adjustment-tool-card">
              <div className="adjustment-tool-heading">
                <strong>{text.colorCleanup}</strong>
                <b>{colorCleanupStrength}</b>
              </div>
              <span>{text.colorCleanupHint}</span>
              <input
                aria-label={text.colorCleanup}
                type="range"
                min={1}
                max={4}
                step={1}
                value={colorCleanupStrength}
                onChange={(event) => setColorCleanupStrength(Number(event.target.value))}
              />
              <button type="button" onClick={applyColorCleanup} disabled={!canEditActiveLayer}>
                {text.applyColorCleanup}
              </button>
            </div>
            <div className="adjustment-tool-card">
              <div className="adjustment-tool-heading">
                <strong>{text.colorLimit}</strong>
                <b>{layerColorLimit}</b>
              </div>
              <span>{text.colorLimitHint}</span>
              <input
                aria-label={text.colorLimit}
                type="range"
                min={2}
                max={48}
                step={1}
                value={layerColorLimit}
                onChange={(event) => setLayerColorLimit(Number(event.target.value))}
              />
              <button type="button" onClick={applyLayerColorLimit} disabled={!canEditActiveLayer}>
                {text.applyColorLimit}
              </button>
            </div>
          </section>
        )}

        {rightTab === 'palette' && (
          <>
            <section className="panel-section view-section">
              <h2>{text.view}</h2>
            <div className="view-toggle-grid">
              <div className="view-shape-toggle" aria-label={text.beadShape}>
                <span>{text.beadShape}</span>
                <div>
                  <button
                    type="button"
                    className={project.settings.beadDisplayMode === 'bead' ? 'active' : ''}
                    aria-pressed={project.settings.beadDisplayMode === 'bead'}
                    onClick={() => updateProject({ ...project, settings: { ...project.settings, beadDisplayMode: 'bead' } })}
                  >
                    <span className="shape-choice-icon shape-choice-icon-round" aria-hidden="true" />
                    <span>{text.roundBeads}</span>
                  </button>
                  <button
                    type="button"
                    className={project.settings.beadDisplayMode === 'pixel' ? 'active' : ''}
                    aria-pressed={project.settings.beadDisplayMode === 'pixel'}
                    onClick={() => updateProject({ ...project, settings: { ...project.settings, beadDisplayMode: 'pixel' } })}
                  >
                    <span className="shape-choice-icon shape-choice-icon-square" aria-hidden="true" />
                    <span>{text.squareBeads}</span>
                  </button>
                </div>
              </div>
              <div className="view-row">
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={project.settings.showGrid}
                    onChange={(event) =>
                      updateProject({ ...project, settings: { ...project.settings, showGrid: event.target.checked } })
                    }
                  />
                  {text.grid}
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={project.settings.showCoordinates}
                    onChange={(event) =>
                      updateProject({ ...project, settings: { ...project.settings, showCoordinates: event.target.checked } })
                    }
                  />
                  {text.coordinates}
                </label>
              </div>
              <div className="view-row">
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={project.settings.showColorCodes}
                    onChange={(event) =>
                      updateProject({ ...project, settings: { ...project.settings, showColorCodes: event.target.checked } })
                    }
                  />
                  {text.showColorCodes}
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={project.settings.showLayerOverlap}
                    onChange={(event) =>
                      updateProject({ ...project, settings: { ...project.settings, showLayerOverlap: event.target.checked } })
                    }
                  />
                  {text.layerOverlap}
                </label>
              </div>
            </div>
            </section>

            <section className="panel-section hover-section">
              <h2>{text.cell}</h2>
              {hoverCell ? (
                <span>
                  R{hoverCell.y + 1} C{hoverCell.x + 1} - {getColor(hoverCell.colorId)?.primaryCode ?? text.empty}
                </span>
              ) : (
                <span>{text.hoverBoard}</span>
              )}
            </section>
          </>
        )}
      </aside>
      {floatingHelp && (
        <div className="floating-help-tooltip" style={{ left: floatingHelp.left, top: floatingHelp.top }}>
          {floatingHelp.text}
        </div>
      )}
      <HelpDialog text={text} dialogRef={helpDialogRef} />
    </main>
  );
}

const PaletteGrid = React.memo(function PaletteGrid({
  colors,
  selectedColorId,
  onSelect,
}: {
  colors: PaletteColor[];
  selectedColorId: string;
  onSelect: (colorId: string) => void;
}) {
  return colors.map((color) => (
    <button
      key={color.id}
      className={selectedColorId === color.id ? 'swatch active' : 'swatch'}
      title={`${color.primaryCode} ${color.name}`}
      onClick={() => onSelect(color.id)}
    >
      <span style={{ backgroundColor: color.hex }} />
      <small>{color.primaryCode}</small>
    </button>
  ));
});


function clampInteger(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3v9" />
      <path d="m6.8 8.8 3.2 3.2 3.2-3.2" />
      <path d="M4 13.2v2.6c0 .7.5 1.2 1.2 1.2h9.6c.7 0 1.2-.5 1.2-1.2v-2.6" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.48.08.66-.2.66-.46v-1.7c-2.68.58-3.25-1.14-3.25-1.14-.44-1.1-1.07-1.4-1.07-1.4-.88-.6.07-.58.07-.58.97.07 1.48 1 1.48 1 .86 1.47 2.25 1.04 2.8.8.09-.62.34-1.04.61-1.28-2.14-.24-4.39-1.07-4.39-4.76 0-1.05.38-1.91 1-2.58-.1-.25-.43-1.24.1-2.55 0 0 .81-.26 2.66.99a9.16 9.16 0 0 1 4.84 0c1.85-1.25 2.66-.99 2.66-.99.53 1.31.2 2.3.1 2.55.62.67 1 1.53 1 2.58 0 3.7-2.26 4.51-4.4 4.75.35.3.66.9.66 1.81v2.5c0 .26.17.55.67.46A9.5 9.5 0 0 0 12 2.5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 6l8 8" />
      <path d="M14 6l-8 8" />
    </svg>
  );
}

function resizeCells(
  cells: Array<string | null>,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
): Array<string | null> {
  const next = Array.from({ length: newWidth * newHeight }, () => null as string | null);
  const copyWidth = Math.min(oldWidth, newWidth);
  const copyHeight = Math.min(oldHeight, newHeight);
  for (let y = 0; y < copyHeight; y += 1) {
    for (let x = 0; x < copyWidth; x += 1) {
      next[y * newWidth + x] = cells[y * oldWidth + x] ?? null;
    }
  }
  return next;
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10" width="13" height="10" rx="2" />
      <path d={locked ? 'M8.5 10V7.7a3.5 3.5 0 017 0V10' : 'M8.5 10V7.7a3.5 3.5 0 016.4-2'} />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l4.6-1 9.8-9.8-3.6-3.6L5 15.4 4 20z" />
      <path d="M13.8 4.6l1.5-1.5c.7-.7 1.8-.7 2.5 0l1.1 1.1c.7.7.7 1.8 0 2.5l-1.5 1.5" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 16V6.8C5 5.8 5.8 5 6.8 5H16" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5h.1M15 5h.1M9 12h.1M15 12h.1M9 19h.1M15 19h.1" />
    </svg>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12s3.3-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.3 5.5-9.2 5.5S2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.5" />
      {!visible && <path d="M4 4l16 16" />}
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4.8h6V7" />
      <path d="M7 7l.8 13h8.4L17 7" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 11a7.5 7.5 0 1 1 2.2 5.3" />
      <path d="M4.5 5.5V11h5.5" />
    </svg>
  );
}

function ClipboardPreview({ pattern }: { pattern: ClipboardPattern }) {
  const maxSide = Math.max(pattern.width, pattern.height, 1);
  const beadSize = Math.max(3, Math.min(10, Math.floor(76 / maxSide)));
  return (
    <div
      className="clipboard-preview"
      style={{
        gridTemplateColumns: `repeat(${pattern.width}, ${beadSize}px)`,
        gridAutoRows: `${beadSize}px`,
      }}
      aria-hidden="true"
    >
      {pattern.cells.map((colorId, index) => {
        const color = colorId ? getColor(colorId) : null;
        return <span key={index} style={{ background: color?.hex ?? 'transparent' }} />;
      })}
    </div>
  );
}

function ToolIcon({ tool }: { tool: ToolId }) {
  if (tool === 'pencil') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20l4.7-1 9.8-9.8-3.7-3.7L5 15.3 4 20z" />
        <path d="M13.8 4.5l1.7-1.7c.7-.7 1.8-.7 2.5 0l1.2 1.2c.7.7.7 1.8 0 2.5l-1.7 1.7" />
      </svg>
    );
  }
  if (tool === 'eraser') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.3 14.6l7.9-7.9c.8-.8 2-.8 2.8 0l4.3 4.3c.8.8.8 2 0 2.8l-5.9 5.9H8.6l-4.3-4.3c-.2-.2-.2-.6 0-.8z" />
        <path d="M9.8 19.7h10" />
      </svg>
    );
  }
  if (tool === 'fill') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l6.5-6.5 7 7-6 6c-.8.8-2 .8-2.8 0L5 14.3c-.5-.5-.5-1.3 0-1.8z" />
        <path d="M8.5 8.5l-2-2" />
        <path d="M17.5 17.2c.8 1.1 1.2 1.9 1.2 2.4 0 1-.7 1.6-1.6 1.6s-1.6-.6-1.6-1.6c0-.5.4-1.3 1.2-2.4.2-.3.6-.3.8 0z" />
      </svg>
    );
  }
  if (tool === 'remove') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l6.5-6.5 7 7-6 6c-.8.8-2 .8-2.8 0L5 14.3c-.5-.5-.5-1.3 0-1.8z" />
        <path d="M8.5 8.5l-2-2" />
        <path d="M15.5 17.5l4 4M19.5 17.5l-4 4" />
      </svg>
    );
  }
  if (tool === 'recolor') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7.5h7.2c2.2 0 4 1.8 4 4v.3" />
        <path d="M9 4.5 6 7.5l3 3" />
        <path d="M18 16.5h-7.2c-2.2 0-4-1.8-4-4v-.3" />
        <path d="M15 19.5l3-3-3-3" />
        <path d="M8 16.2c.9 1.2 1.3 2 1.3 2.6 0 1-.7 1.7-1.7 1.7S6 19.8 6 18.8c0-.6.4-1.4 1.3-2.6.2-.3.5-.3.7 0z" />
      </svg>
    );
  }
  if (tool === 'eyedropper') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14.8 4.3l4.9 4.9-3.1 3.1-1.5-1.5-7.9 7.9H4.8v-2.4l7.9-7.9-1.1-1.1 3.2-3z" />
        <path d="M5 20h6" />
      </svg>
    );
  }
  if (tool === 'move') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M8.5 6.5 12 3l3.5 3.5" />
        <path d="M8.5 17.5 12 21l3.5-3.5" />
        <path d="M3 12h18" />
        <path d="M6.5 8.5 3 12l3.5 3.5" />
        <path d="M17.5 8.5 21 12l-3.5 3.5" />
      </svg>
    );
  }
  if (tool === 'copy') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M5 16V6.8C5 5.8 5.8 5 6.8 5H16" />
        <path d="M11 12h5M13.5 9.5v5" />
      </svg>
    );
  }
  if (tool === 'paste') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5h6l1 2h2.2c.9 0 1.8.8 1.8 1.8v9.4c0 1-.8 1.8-1.8 1.8H5.8c-1 0-1.8-.8-1.8-1.8V8.8C4 7.8 4.8 7 5.8 7H8z" />
        <path d="M9 5c0-1.1.8-2 2-2h2c1.2 0 2 .9 2 2" />
        <path d="M8 12h8M8 16h5" />
      </svg>
    );
  }
  if (tool === 'mirror') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16" />
        <path d="M5 7.5h4v9H5z" />
        <path d="M19 7.5h-4v9h4z" />
        <path d="M9 12h6" />
        <path d="M7 5.5 5 7.5l2 2" />
        <path d="M17 5.5l2 2-2 2" />
      </svg>
    );
  }
  if (tool === 'shape') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 16.5 9 8.5l4 7.5z" />
        <path d="M13.8 5.2h5v5h-5z" />
        <path d="M14.8 17.4a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 0 0-5.6 0z" />
      </svg>
    );
  }
  if (tool === 'text') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6h14" />
        <path d="M12 6v12" />
        <path d="M8.5 18h7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 11.5V6.8a2 2 0 0 1 4 0v4.5" />
      <path d="M12.5 11V5.5a2 2 0 0 1 4 0V12" />
      <path d="M16.5 12V8.2a2 2 0 0 1 4 0v6.3c0 3.8-2.7 6.5-6.7 6.5h-1.5c-2.1 0-3.6-.8-4.9-2.4L4.6 15c-.6-.8-.4-1.9.4-2.4.6-.4 1.4-.3 1.9.2l1.6 1.7v-3z" />
    </svg>
  );
}

function ShapeOptionIcon({ shape }: { shape: ShapeKind }) {
  if (shape === 'line') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19 19 5" />
      </svg>
    );
  }
  if (shape === 'rectangle') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14v10H5z" />
      </svg>
    );
  }
  if (shape === 'square') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 6.5h11v11h-11z" />
      </svg>
    );
  }
  if (shape === 'ellipse') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 12a7.5 5.2 0 1 0 15 0 7.5 5.2 0 0 0-15 0z" />
      </svg>
    );
  }
  if (shape === 'circle') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 12a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0z" />
      </svg>
    );
  }
  if (shape === 'triangle') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5 19 18H5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h12" />
      <path d="M13 8l4 4-4 4" />
    </svg>
  );
}

function ArrowOptionIcon({ arrow }: { arrow: ArrowKind }) {
  if (arrow === 'double') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 12h12" />
        <path d="M10 8 6 12l4 4" />
        <path d="M14 8l4 4-4 4" />
      </svg>
    );
  }
  if (arrow === 'block') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 9h8V6l6 6-6 6v-3H5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h12" />
      <path d="M13 8l4 4-4 4" />
    </svg>
  );
}
