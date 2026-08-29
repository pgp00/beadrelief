import type { PrintableModel, PrintablePart } from './model';
import { validatePrintableModel } from './validation';
import { createDeflatedZip, createStoredZip, type ZipEntry } from './zip';

const encoder = new TextEncoder();

export function createThreeMfEntries(model: PrintableModel): ZipEntry[] {
  const errors = validatePrintableModel(model);
  if (errors.length) throw new Error(errors.join('\n'));
  return [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml()) },
    { name: '_rels/.rels', data: encoder.encode(relationshipsXml()) },
    { name: '3D/3dmodel.model', data: encoder.encode(modelXml(model)) },
    { name: 'Metadata/project_settings.config', data: encoder.encode(projectSettingsJson(model)) },
    { name: 'Metadata/model_settings.config', data: encoder.encode(modelSettingsXml(model)) },
  ];
}

export function createThreeMf(model: PrintableModel): Uint8Array {
  return createStoredZip(createThreeMfEntries(model));
}

export function createCompressedThreeMf(model: PrintableModel): Promise<Uint8Array> {
  return createDeflatedZip(createThreeMfEntries(model));
}

export async function downloadThreeMf(model: PrintableModel, filename: string): Promise<void> {
  const bytes = await createCompressedThreeMf(model);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: 'model/3mf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.3mf') ? filename : `${filename}.3mf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
}

function relationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
}

function modelXml(model: PrintableModel): string {
  const objectStartId = 2;
  const assemblyId = objectStartId + model.parts.length;
  const materials = model.materials.map((material) =>
    `      <base name="${escapeXml(material.name)}" displaycolor="${material.hex.toLowerCase()}ff"/>`,
  ).join('\n');
  const objects = model.parts.map((part, index) =>
    meshObjectXml(part, objectStartId + index, model.materials.findIndex((material) => material.id === part.materialId)),
  ).join('\n');
  const components = model.parts.map((_, index) =>
    `          <component objectid="${objectStartId + index}"/>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
  <metadata name="Application">BeadRelief-0.1.0</metadata>
  <metadata name="BambuStudio:3mfVersion">1</metadata>
  <resources>
    <basematerials id="1">
${materials}
    </basematerials>
${objects}
    <object id="${assemblyId}" name="${escapeXml(model.name)}" type="model">
      <components>
${components}
      </components>
    </object>
  </resources>
  <build>
    <item objectid="${assemblyId}"/>
  </build>
</model>`;
}

function projectSettingsJson(model: PrintableModel): string {
  return `${JSON.stringify({
    filament_colour: model.materials.map((material) => material.hex.toUpperCase()),
    filament_type: model.materials.map(() => 'PLA'),
    nozzle_diameter: ['0.4'],
    ...(model.mode === 'layered' ? {
      layer_height: '0.08',
      initial_layer_print_height: '0.08',
    } : {}),
  }, null, 4)}\n`;
}

function modelSettingsXml(model: PrintableModel): string {
  const objectId = 2 + model.parts.length;
  const parts = model.parts.map((part, index) => {
    const materialIndex = model.materials.findIndex((material) => material.id === part.materialId);
    if (materialIndex < 0) throw new Error(`${part.name} references a missing material.`);
    return `    <part id="${2 + index}" subtype="normal_part">
      <metadata key="name" value="${escapeXml(part.name)}"/>
      <metadata key="extruder" value="${materialIndex + 1}"/>
    </part>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${objectId}">
    <metadata key="name" value="${escapeXml(model.name)}"/>
${parts}
  </object>
</config>`;
}

function meshObjectXml(part: PrintablePart, id: number, materialIndex: number): string {
  const vertices: string[] = [];
  for (let index = 0; index < part.vertices.length; index += 3) {
    vertices.push(
      `          <vertex x="${number(part.vertices[index])}" y="${number(part.vertices[index + 1])}" z="${number(part.vertices[index + 2])}"/>`,
    );
  }
  const triangles: string[] = [];
  for (let index = 0; index < part.triangles.length; index += 3) {
    triangles.push(
      `          <triangle v1="${part.triangles[index]}" v2="${part.triangles[index + 1]}" v3="${part.triangles[index + 2]}"/>`,
    );
  }
  return `    <object id="${id}" name="${escapeXml(part.name)}" type="model" pid="1" pindex="${materialIndex}">
      <mesh>
        <vertices>
${vertices.join('\n')}
        </vertices>
        <triangles>
${triangles.join('\n')}
        </triangles>
      </mesh>
    </object>`;
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error('3MF coordinates must be finite numbers.');
  return Number(value.toFixed(6)).toString();
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] as string);
}
