import { DEFAULT_AMS_COLORS, makeAmsColorId, replaceProjectColor } from './print/colors';
import type { PrintableModel } from './print/model';
import type { StackTemplateId } from './print/stacking';
import { withLayeredMaterials, withPrintMode, withStackTemplate } from './project';
import type { BeadProject, PrintMode, PrintSettings } from './types';

type Props = {
  project: BeadProject;
  model: PrintableModel;
  errors: string[];
  language: 'zh' | 'en';
  onChange: (project: BeadProject) => void;
  onCommit: () => void;
  onExport: () => void;
};

const numberFields: Array<{
  key: keyof Pick<PrintSettings, 'cellPitchMm' | 'baseThicknessMm' | 'beadHeightMm' | 'dimpleDiameterMm' | 'dimpleDepthMm'>;
  zh: string;
  en: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'cellPitchMm', zh: '格距', en: 'Pitch', min: 2, max: 10, step: 0.1 },
  { key: 'baseThicknessMm', zh: '底板厚度', en: 'Base', min: 0.4, max: 5, step: 0.2 },
  { key: 'beadHeightMm', zh: '拼豆浮雕', en: 'Relief', min: 0.2, max: 4, step: 0.2 },
  { key: 'dimpleDiameterMm', zh: '中心凹点直径', en: 'Dimple Ø', min: 0, max: 5, step: 0.1 },
  { key: 'dimpleDepthMm', zh: '中心凹点深度', en: 'Dimple depth', min: 0, max: 2, step: 0.1 },
];

export default function PrintSettingsPanel({ project, model, errors, language, onChange, onCommit, onExport }: Props) {
  const zh = language === 'zh';

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
    const previous = project.amsColors[index];
    const color = { ...previous, ...change };
    color.id = makeAmsColorId(index + 1, color.hex);
    if (project.printSettings.mode === 'layered') {
      onChange(withLayeredMaterials(project, project.amsColors.map((item, itemIndex) => itemIndex === index ? color : item)));
      return;
    }
    const renamed = color.id === previous.id ? project : replaceProjectColor(project, previous.id, color.id);
    onChange({ ...renamed, amsColors: renamed.amsColors.map((item, itemIndex) => itemIndex === index ? color : item) });
  }

  function addColor() {
    const fallback = DEFAULT_AMS_COLORS[project.amsColors.length];
    if (!fallback) return;
    const materials = [...project.amsColors, { ...fallback }];
    onCommit();
    onChange(project.printSettings.mode === 'layered'
      ? withLayeredMaterials(project, materials)
      : { ...project, amsColors: materials });
  }

  function removeLastColor() {
    const minimum = project.printSettings.mode === 'layered' ? 2 : 1;
    if (project.amsColors.length <= minimum) return;
    const removed = project.amsColors[project.amsColors.length - 1];
    onCommit();
    if (project.printSettings.mode === 'layered') {
      onChange(withLayeredMaterials(project, project.amsColors.slice(0, -1)));
      return;
    }
    const remapped = replaceProjectColor(project, removed.id, project.amsColors[0].id);
    onChange({ ...remapped, amsColors: remapped.amsColors.slice(0, -1) });
  }

  function updateNumber(key: keyof PrintSettings, value: number) {
    onChange({ ...project, printSettings: { ...project.printSettings, [key]: value } });
  }

  const visibleNumberFields = project.printSettings.mode === 'layered'
    ? numberFields.filter((field) => field.key !== 'beadHeightMm' && field.key !== 'dimpleDepthMm')
    : numberFields;

  return (
    <section className="left-card print-settings-card">
      <div className="left-card-header">
        <div>
          <strong>{zh ? 'AMS 与 3D 打印' : 'AMS & 3D print'}</strong>
          <span>{zh ? '最多 4 色 · P2S 预留边界' : 'Up to 4 colors · P2S margin'}</span>
        </div>
        <small>{model.materials.length}/4 {zh ? '种材料' : 'materials'}</small>
      </div>

      <div className="print-mode-row" aria-label={zh ? '打印颜色模式' : 'Print color mode'}>
        <label>
          <input type="radio" name="print-mode" checked={project.printSettings.mode === 'solid'} onChange={() => setMode('solid')} />
          {zh ? '普通四色' : 'Solid colors'}
        </label>
        <label>
          <input
            type="radio"
            name="print-mode"
            disabled={project.amsColors.length < 2}
            checked={project.printSettings.mode === 'layered'}
            onChange={() => setMode('layered')}
          />
          {zh ? 'AMS 叠色' : 'AMS layered'}
        </label>
      </div>
      {project.printSettings.mode === 'layered' && (
        <>
          <div className="stack-template-row">
            <button type="button" onClick={() => applyTemplate('cmyw')}>CMYW</button>
            <button type="button" onClick={() => applyTemplate('rybw')}>RYBW</button>
          </div>
          <p className="stack-mode-note">
            {zh
              ? '从底到顶 · 预计成色 · 0.08 mm/层 · 每种耗材 4 层。示例 TD 仅供预览；打印前请校准。'
              : 'Bottom to top · estimated color · 0.08 mm/layer · 4 layers per filament. Template TD values are estimates; calibrate before printing.'}
          </p>
        </>
      )}

      <div className="ams-color-list">
        {project.amsColors.map((color, index) => (
          <div className="ams-color-row" key={color.id}>
            <span className="ams-slot">AMS {index + 1}</span>
            <input
              type="color"
              aria-label={`AMS ${index + 1} color`}
              value={color.hex}
              onChange={(event) => updateColor(index, { hex: event.target.value })}
            />
            <input
              type="text"
              aria-label={`AMS ${index + 1} name`}
              value={color.name}
              maxLength={32}
              onChange={(event) => updateColor(index, { name: event.target.value })}
            />
            {project.printSettings.mode === 'layered' && (
              <label className="ams-td-field">
                <span>TD (mm)</span>
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  disabled={index === 0}
                  value={color.tdMm}
                  onChange={(event) => updateColor(index, {
                    tdMm: Math.min(100, Math.max(0.01, Number(event.target.value) || 0.01)),
                  })}
                />
              </label>
            )}
          </div>
        ))}
      </div>

      <div className="ams-actions">
        <button type="button" disabled={project.amsColors.length >= 4} onClick={addColor}>
          {zh ? '增加颜色' : 'Add color'}
        </button>
        <button type="button" disabled={project.amsColors.length <= (project.printSettings.mode === 'layered' ? 2 : 1)} onClick={removeLastColor}>
          {zh ? '移除最后一色' : 'Remove last'}
        </button>
      </div>

      <div className="print-number-grid">
        {visibleNumberFields.map((field) => (
          <label key={field.key}>
            <span>{zh ? field.zh : field.en} (mm)</span>
            <input
              type="number"
              min={field.min}
              max={field.key === 'dimpleDiameterMm'
                ? Math.max(0, project.printSettings.cellPitchMm - field.step * 2)
                : field.key === 'dimpleDepthMm'
                  ? Math.max(0, project.printSettings.beadHeightMm - field.step)
                  : field.max}
              step={field.key === 'baseThicknessMm' && project.printSettings.mode === 'layered' ? 0.08 : field.step}
              value={project.printSettings[field.key]}
              onChange={(event) => updateNumber(field.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>

      {project.printSettings.mode === 'layered' ? (
        <div className="print-base-color">
          <span>{zh ? '底板 / 背景颜色' : 'Base / background color'}</span>
          <strong>AMS 1 · {project.amsColors[0].name}</strong>
        </div>
      ) : (
        <label className="print-base-color">
          <span>{zh ? '底板 / 背景颜色' : 'Base / background color'}</span>
          <select
            value={project.printSettings.baseColorId}
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
        <span>{model.gridSize.width * model.gridSize.height} {zh ? '格' : 'cells'}</span>
        <strong>{model.sizeMm.x.toFixed(1)} × {model.sizeMm.y.toFixed(1)} × {model.sizeMm.z.toFixed(1)} mm</strong>
      </div>

      {model.layered && (
        <div className="stack-print-summary">
          <span>{model.layered.perceivedColorCount} {zh ? '种预计成色已使用' : 'estimated colors used'}</span>
          <span>0.08 mm/{zh ? '层' : 'layer'}</span>
          <span>{model.layered.swapCount} {zh ? '次全局换料' : 'global swaps'}</span>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="print-errors" role="alert">
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}

      <button type="button" className="primary print-export-button" disabled={errors.length > 0} onClick={onExport}>
        {zh ? '导出 AMS 分件 3MF' : 'Export AMS multi-part 3MF'}
      </button>
    </section>
  );
}
