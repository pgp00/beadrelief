import { DEFAULT_AMS_COLORS, makeAmsColorId, replaceProjectColor } from './print/colors';
import type { PrintableModel } from './print/model';
import type { BeadProject, PrintSettings } from './types';

type Props = {
  project: BeadProject;
  model: PrintableModel;
  errors: string[];
  language: 'zh' | 'en';
  onChange: (project: BeadProject) => void;
  onBeforeRemoveColor: () => void;
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

export default function PrintSettingsPanel({ project, model, errors, language, onChange, onBeforeRemoveColor, onExport }: Props) {
  const zh = language === 'zh';

  function updateColor(index: number, change: { name?: string; hex?: string }) {
    const previous = project.amsColors[index];
    const color = { ...previous, ...change };
    color.id = makeAmsColorId(index + 1, color.hex);
    const next = color.id === previous.id ? project : replaceProjectColor(project, previous.id, color.id);
    onChange({
      ...next,
      amsColors: next.amsColors.map((item, itemIndex) => itemIndex === index ? color : item),
    });
  }

  function addColor() {
    const fallback = DEFAULT_AMS_COLORS[project.amsColors.length];
    if (!fallback) return;
    onChange({ ...project, amsColors: [...project.amsColors, { ...fallback }] });
  }

  function removeLastColor() {
    if (project.amsColors.length <= 1) return;
    const removed = project.amsColors[project.amsColors.length - 1];
    if (!removed) return;
    const next = replaceProjectColor(project, removed.id, project.amsColors[0].id);
    onBeforeRemoveColor();
    onChange({ ...next, amsColors: next.amsColors.slice(0, -1) });
  }

  function updateNumber(key: keyof PrintSettings, value: number) {
    onChange({ ...project, printSettings: { ...project.printSettings, [key]: value } });
  }

  return (
    <section className="left-card print-settings-card">
      <div className="left-card-header">
        <div>
          <strong>{zh ? 'AMS 与 3D 打印' : 'AMS & 3D print'}</strong>
          <span>{zh ? '最多 4 色 · P2S 预留边界' : 'Up to 4 colors · P2S margin'}</span>
        </div>
        <small>{model.materials.length}/4 {zh ? '种材料' : 'materials'}</small>
      </div>

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
          </div>
        ))}
      </div>

      <div className="ams-actions">
        <button type="button" disabled={project.amsColors.length >= 4} onClick={addColor}>
          {zh ? '增加颜色' : 'Add color'}
        </button>
        <button type="button" disabled={project.amsColors.length <= 1} onClick={removeLastColor}>
          {zh ? '移除最后一色' : 'Remove last'}
        </button>
      </div>

      <div className="print-number-grid">
        {numberFields.map((field) => (
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
              step={field.step}
              value={project.printSettings[field.key]}
              onChange={(event) => updateNumber(field.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>

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

      <div className="print-size-line">
        <span>{model.gridSize.width * model.gridSize.height} {zh ? '格' : 'cells'}</span>
        <strong>{model.sizeMm.x.toFixed(1)} × {model.sizeMm.y.toFixed(1)} × {model.sizeMm.z.toFixed(1)} mm</strong>
      </div>

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
