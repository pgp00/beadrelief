import test from "node:test";
import assert from "node:assert/strict";
import { createProject, withStackTemplate } from "../generated/dist/src/project.js";
import { buildStackPalette } from "../generated/dist/src/print/stacking.js";
import { buildPrintableModel, composePrintableGrid } from "../generated/dist/src/print/model.js";
import { createThreeMf } from "../generated/dist/src/print/threeMf.js";
import { downloadPrintPdf, downloadPrintPng, downloadUsageWorkbook } from "../generated/dist/src/exporters.js";
import { summarizeLayeredUsage, summarizeUsage } from "../generated/dist/src/usage.js";
import { readZipEntries } from "./helpers/zip.mjs";

const decoder = new TextDecoder();
const pngBytes = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

function noopContext() {
  const noop = () => {};
  return {
    scale: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    save: noop,
    restore: noop,
    setLineDash: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
  };
}

function installDownloadEnvironment(t) {
  const originalDocument = globalThis.document;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const blobs = new Map();
  const downloads = [];
  let nextUrl = 1;

  URL.createObjectURL = (blob) => {
    const url = `blob:test-${nextUrl++}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    createElement(tag) {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => noopContext(),
          toBlob: (callback) => callback(new Blob([pngBytes], { type: "image/png" })),
          toDataURL: () => "data:image/jpeg;base64,/9j/2Q==",
        };
      }
      if (tag === "a") {
        return {
          href: "",
          download: "",
          click() {
            downloads.push({ name: this.download, blob: blobs.get(this.href) });
          },
        };
      }
      throw new Error(`Unexpected element: ${tag}`);
    },
  };

  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });
  return downloads;
}

async function downloadedBytes(download) {
  assert.ok(download?.blob instanceof Blob);
  return new Uint8Array(await download.blob.arrayBuffer());
}

test("custom AMS names agree across usage, XLSX, and 3MF while sheet names remain Excel-safe", async (t) => {
  const downloads = installDownloadEnvironment(t);
  const project = createProject(1, 1, "Export contract");
  project.amsColors[0] = { ...project.amsColors[0], name: "Studio & Cyan" };
  const colorId = project.amsColors[0].id;
  const names = ["Alpha", "alpha", "'History'", "'Quoted'"];
  project.layers = names.map((name, index) => ({
    ...project.layers[0],
    id: `layer-${index + 1}`,
    name,
    customName: true,
    cells: [colorId],
  }));
  project.activeLayerId = project.layers[0].id;
  project.cells = [colorId];

  assert.equal(summarizeUsage(project)[0].color.name, "Studio & Cyan");
  downloadUsageWorkbook(project);
  const workbook = readZipEntries(await downloadedBytes(downloads[0]));
  assert.deepEqual([...workbook.keys()], [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet2.xml",
    "xl/worksheets/sheet3.xml",
    "xl/worksheets/sheet4.xml",
    "xl/worksheets/sheet5.xml",
  ]);
  const workbookXml = decoder.decode(workbook.get("xl/workbook.xml"));
  const sheetNames = [...workbookXml.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sheetNames, ["\u603b\u6570", "Alpha", "alpha 2", "History 1", "Quoted"]);
  assert.equal(new Set(sheetNames.map((name) => name.toLowerCase())).size, sheetNames.length);
  assert.ok(sheetNames.every((name) => !name.startsWith("'") && !name.endsWith("'") && name.toLowerCase() !== "history"));
  assert.match(decoder.decode(workbook.get("xl/worksheets/sheet1.xml")), /Studio &amp; Cyan/);

  const modelXml = decoder.decode(readZipEntries(createThreeMf(buildPrintableModel(composePrintableGrid(project)))).get("3D/3dmodel.model"));
  assert.match(modelXml, /name="Studio &amp; Cyan"/);
});

test("Layered XLSX reports AMS order and layer cells without bead-pack estimates", async (t) => {
  const downloads = installDownloadEnvironment(t);
  const project = withStackTemplate(createProject(2, 1, "Layered usage"), "rybw");
  project.amsColors = project.amsColors.map((color, index) => ({ ...color, name: `Custom AMS ${index + 1}` }));
  const palette = buildStackPalette(project.amsColors);
  project.layers[0].cells = [palette[4].id, palette[8].id];
  project.materialProfile.measuredColors = [{ stopLevel: palette[4].stopLevel, hex: "#123456" }];
  project.cells = [...project.layers[0].cells];

  assert.deepEqual(summarizeLayeredUsage(project).map((row) => row.layerCells), [8, 8, 4, 0]);
  downloadUsageWorkbook(project);
  const workbook = readZipEntries(await downloadedBytes(downloads[0]));
  const sheet = decoder.decode(workbook.get("xl/worksheets/sheet1.xml"));
  assert.match(sheet, />AMS</);
  assert.match(sheet, />\u987a\u5e8f</);
  assert.match(sheet, />Layer cells</);
  assert.match(sheet, />Custom AMS 1</);
  assert.match(sheet, /<v>8<\/v>/);
  assert.match(sheet, /<v>4<\/v>/);
  assert.match(sheet, />Surface stops</);
  assert.match(sheet, />#123456</);
  assert.doesNotMatch(sheet, /\u9884\u8ba1\u5305\u6570|\u6bcf\u5305\u6570\u91cf|\u603b\u9897\u6570/);

  downloadUsageWorkbook(project, false);
  const patternWorkbook = readZipEntries(await downloadedBytes(downloads[1]));
  const patternSheet = decoder.decode(patternWorkbook.get("xl/worksheets/sheet1.xml"));
  assert.match(patternSheet, /\u603b\u9897\u6570/);
  assert.doesNotMatch(patternSheet, />Layer cells</);
});

test("PNG and PDF downloads have their required binary structure", async (t) => {
  const downloads = installDownloadEnvironment(t);
  const project = createProject(1, 1, "Binary export");
  project.layers[0].cells = [project.amsColors[0].id];
  project.cells = [...project.layers[0].cells];
  const options = { showColorCodes: true, showGuideLines: false, exportBounds: "canvas", projectName: project.name };

  downloadPrintPng(project, options);
  downloadPrintPdf(project, options);
  assert.deepEqual(downloads.map(({ name }) => name), ["Binary-export.png", "Binary-export.pdf"]);

  const png = await downloadedBytes(downloads[0]);
  assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const pngTypes = [];
  for (let offset = 8; offset < png.length;) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
    pngTypes.push(decoder.decode(png.slice(offset + 4, offset + 8)));
    offset += 12 + length;
  }
  assert.deepEqual(pngTypes, ["IHDR", "IDAT", "IEND"]);

  const pdf = await downloadedBytes(downloads[1]);
  const pdfText = decoder.decode(pdf);
  assert.ok(pdfText.startsWith("%PDF-1.4\n"));
  assert.match(pdfText, /\/Subtype \/Image/);
  assert.match(pdfText, /\/Filter \/DCTDecode/);
  const startXref = /startxref\n(\d+)\n%%EOF$/.exec(pdfText);
  assert.ok(startXref);
  assert.equal(decoder.decode(pdf.slice(Number(startXref[1]), Number(startXref[1]) + 4)), "xref");
});
