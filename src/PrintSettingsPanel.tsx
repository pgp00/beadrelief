import { DEFAULT_AMS_COLORS, makeAmsColorId } from './print/colors.js';
import type { PrintableModel } from './print/model.js';
import { PRINT_SETTING_LIMITS, normalizeLayeredBaseThickness, normalizePrintSetting, type NumericPrintSetting } from './print/settings.js';
import { STACK_LAYER_HEIGHT_MM, type StackTemplateId } from './print/stacking.js';
import { withMaterials, withPrintMode, withStackTemplate } from './project.js';
import { ui } from './i18n.js';
import type { BeadProject, PrintMode, PrintSettings } from './types.js';

type Props = {
  project: BeadProject;
  model: PrintableModel;
  errors: string[];
  language: 'zh' | 'en';
  onChange: (project: BeadProject) => void;
  onCommit: () => void;
  onExport: () => void;
  exportDisabled?: boolean;
};

const numberFields: Array<{
  key: NumericPrintSetting;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'cellPitchMm', ...PRINT_SETTING_LIMITS.cellPitchMm, step: 0.1 },
  { key: 'baseThicknessMm', ...PRINT_SETTING_LIMITS.baseThicknessMm, step: 0.2 },
  { key: 'beadHeightMm', ...PRINT_SETTING_LIMITS.beadHeightMm, step: 0.2 },
  { key: 'dimpleDiameterMm', ...PRINT_SETTING_LIMITS.dimpleDiameterMm, step: 0.1 },
  { key: 'dimpleDepthMm', ...PRINT_SETTING_LIMITS.dimpleDepthMm, step: 0.1 },
  { key: 'borderWidthMm', ...PRINT_SETTING_LIMITS.borderWidthMm, step: 0.5 },
  { key: 'hangingHoleDiameterMm', ...PRINT_SETTING_LIMITS.hangingHoleDiameterMm, step: 0.5 },
];

export default function PrintSettingsPanel({ project, model, errors, language, onChange, onCommit, onExport, exportDisabled = false }: Props) {
  const text = ui[language];
  const panel = text.printPanel;

  function setMode(mode: PrintMode) {
    if (mode === project.printSettings.mode) return;
    onCommit();
    onChange(withPrintMode(project, mode));
  }

  function applyTemplate(id: StackTemplateId) {
    onCommit();
    onChange(withStackTemplate(project, id));
  }

  function updateColor(index: number, change: { name?: string; hex?: string; tdMm?: number }) {
    const color = { ...project.amsColors[index], ...change };
    color.id = makeAmsColorId(index + 1, color.hex);
    onChange(withMaterials(project, project.amsColors.map((item, itemIndex) => itemIndex === index ? color : item)));
  }

  function addColor() {
    const fallback = DEFAULT_AMS_COLORS[project.amsColors.length];
    if (!fallback) return;
    const materials = [...project.amsColors, { ...fallback }];
    onCommit();
    onChange(withMaterials(project, materials));
  }

  function removeLastColor() {
    const minimum = project.printSettings.mode === 'layered' ? 2 : 1;
    if (project.amsColors.length <= minimum) return;
    onCommit();
    onChange(withMaterials(project, project.amsColors.slice(0, -1)));
  }

  function updateNumber(key: NumericPrintSetting, value: number) {
    let normalized = normalizePrintSetting(key, value, project.printSettings[key]);
    if (key === 'baseThicknessMm' && project.printSettings.mode === 'layered') {
      normalized = normalizeLayeredBaseThickness(normalized, project.printSettings.baseThicknessMm);
    }
    const printSettings: PrintSettings = {
      ...project.printSettings,
      [key]: normalized,
    };
    printSettings.dimpleDiameterMm = Math.min(printSettings.dimpleDiameterMm, Math.max(0, printSettings.cellPitchMm - 0.2));
    printSettings.dimpleDepthMm = Math.min(printSettings.dimpleDepthMm, Math.max(0, printSettings.beadHeightMm - 0.2));
    onChange({ ...project, printSettings });
  }

  const visibleNumberFields = project.printSettings.mode === 'layered'
    ? numberFields.filter((field) => field.key !== 'beadHeightMm' && field.key !== 'dimpleDepthMm')
    : numberFields;

  return (
    <section className="left-card print-settings-card">
      <div className="left-card-header">
        <div>
          <strong>{panel.title}</strong>
          <span>{panel.subtitle}</span>
        </div>
        <small>{model.materials.length}/4 {panel.materials}</small>
      </div>

      <div className="print-mode-row" aria-label={panel.mode}>
        <label>
          <input type="radio" name="print-mode" checked={project.printSettings.mode === 'solid'} onChange={() => setMode('solid')} />
          {panel.solid}
        </label>
        <label>
          <input
            type="radio"
            name="print-mode"
            disabled={project.amsColors.length < 2}
            checked={project.printSettings.mode === 'layered'}
            onChange={() => setMode('layered')}
          />
          {panel.layered}
        </label>
      </div>
      {project.printSettings.mode === 'layered' && (
        <>
          <div className="stack-template-row">
            <button type="button" onClick={() => applyTemplate('cmyw')}>CMYW</button>
            <button type="button" onClick={() => applyTemplate('rybw')}>RYBW</button>
          </div>
          <p className="stack-mode-note">{panel.experimental}</p>
        </>
      )}

      <div className="ams-color-list">
        {project.amsColors.map((color, index) => (
          <div className="ams-color-row" key={`ams-slot-${index + 1}`}>
            <span className="ams-slot">AMS {index + 1}</span>
            <input
              type="color"
              aria-label={`AMS ${index + 1} ${panel.color}`}
              value={color.hex}
              onFocus={onCommit}
              onChange={(event) => updateColor(index, { hex: event.target.value })}
            />
            <input
              type="text"
              aria-label={`AMS ${index + 1} ${panel.name}`}
              value={color.name}
              maxLength={32}
              onFocus={onCommit}
              onChange={(event) => updateColor(index, { name: event.target.value })}
            />
            {project.printSettings.mode === 'layered' && (
              <label className="ams-td-field">
                <span>TD (mm)</span>
                <input
                  type="number"
                  aria-label={`AMS ${index + 1} TD (mm)`}
                  min="0.01"
                  max="100"
                  step="0.01"
                  disabled={index === 0}
                  value={color.tdMm}
                  onFocus={onCommit}
                  onChange={(event) => updateColor(index, {
                    tdMm: Math.min(100, Math.max(0.01, Number(event.target.value) || 0.01)),
                  })}
                />
                {index === 0 && (
                  <small className="ams-td-base-hint">
                    {panel.opaque}
                  </small>
                )}
              </label>
            )}
          </div>
        ))}
      </div>

      <div className="ams-actions">
        <button type="button" disabled={project.amsColors.length >= 4} onClick={addColor}>
          {panel.addColor}
        </button>
        <button type="button" disabled={project.amsColors.length <= (project.printSettings.mode === 'layered' ? 2 : 1)} onClick={removeLastColor}>
          {panel.removeLast}
        </button>
      </div>

      <div className="print-number-grid">
        {visibleNumberFields.map((field) => (
          <label key={field.key}>
            <span>{text.printFields[field.key]} (mm)</span>
            <input
              type="number"
              min={field.min}
              max={field.key === 'dimpleDiameterMm'
                ? Math.max(0, project.printSettings.cellPitchMm - field.step * 2)
                : field.key === 'dimpleDepthMm'
                  ? Math.max(0, project.printSettings.beadHeightMm - field.step)
                  : field.max}
              step={field.key === 'baseThicknessMm' && project.printSettings.mode === 'layered' ? STACK_LAYER_HEIGHT_MM : field.step}
              value={project.printSettings[field.key]}
              onFocus={onCommit}
              onChange={(event) => updateNumber(field.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>

      <div className="print-feature-grid">
        <label>
          <input
            type="checkbox"
            checked={project.printSettings.separateBase}
            onChange={(event) => {
              onCommit();
              onChange({ ...project, printSettings: { ...project.printSettings, separateBase: event.target.checked } });
            }}
          />
          {panel.separateBackplate}
        </label>
        <label>
          <span>{panel.backText}</span>
          <input
            type="text"
            value={project.printSettings.backText}
            maxLength={12}
            onFocus={onCommit}
            onChange={(event) => onChange({
              ...project,
              printSettings: {
                ...project.printSettings,
                backText: event.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 12),
              },
            })}
          />
        </label>
      </div>

      {project.printSettings.mode === 'layered' ? (
        <div className="print-base-color">
          <span>{panel.baseColor}</span>
          <strong>AMS 1 · {project.amsColors[0].name}</strong>
        </div>
      ) : (
        <label className="print-base-color">
          <span>{panel.baseColor}</span>
          <select
            value={project.printSettings.baseColorId}
            onFocus={onCommit}
            onChange={(event) => onChange({
              ...project,
              printSettings: { ...project.printSettings, baseColorId: event.target.value },
            })}
          >
            {project.amsColors.map((color, index) => (
              <option value={color.id} key={color.id}>AMS {index + 1} · {color.name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="print-size-line">
        <span>{model.gridSize.width * model.gridSize.height} {panel.cells}</span>
        <strong>{model.sizeMm.x.toFixed(1)} × {model.sizeMm.y.toFixed(1)} × {model.sizeMm.z.toFixed(1)} mm</strong>
      </div>
      <p className="stack-mode-note">{panel.sizeLimit}</p>

      {model.layered && (
        <div className="stack-print-summary">
          <span>{model.layered.perceivedColorCount} {panel.estimatedColors}</span>
          <span>0.08 mm/{panel.layer}</span>
          <span>{model.layered.swapCount} {panel.globalSwaps}</span>
        </div>
      )}

      {errors.length > 0 && (
        <ul id="print-export-errors" className="print-errors" role="alert" tabIndex={-1}>
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}

      <button type="button" className="primary print-export-button" disabled={errors.length > 0 || exportDisabled} onClick={onExport}>
        {panel.export}
      </button>
    </section>
  );
}
