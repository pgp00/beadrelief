import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import { MAX_IMAGE_FILE_BYTES, planImageConversion, rgbaToBeads, validateImageFileSize } from '../generated/dist/src/imageToBeads.js';
import { palette } from '../generated/dist/src/palette.js';
import { buildPrintableModel, composePrintableGrid } from '../generated/dist/src/print/model.js';
import { buildStackPalette } from '../generated/dist/src/print/stacking.js';
import { createCompressedThreeMf } from '../generated/dist/src/print/threeMf.js';
import { createProject, withStackTemplate } from '../generated/dist/src/project.js';
import { readZipEntries } from './helpers/zip.mjs';

test('native raw-DEFLATE keeps a full 32x32 Layered 3MF below 10 MB', async () => {
  const project = withStackTemplate(createProject(32, 32, 'Layered performance'), 'rybw');
  const topColor = buildStackPalette(project.amsColors).at(-1).id;
  project.layers[0].cells.fill(topColor);
  const archive = await createCompressedThreeMf(buildPrintableModel(composePrintableGrid(project)));
  assert.ok(archive.byteLength < 10 * 1024 * 1024, `${archive.byteLength} bytes`);
  const entries = readZipEntries(archive);
  assert.match(new TextDecoder().decode(entries.get('3D/3dmodel.model')), /^<\?xml/);
  assert.ok(entries.has('Metadata/project_settings.config'));
});

test('3MF export falls back to a stored ZIP without native compression', async () => {
  const original = globalThis.CompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    const archive = await createCompressedThreeMf(buildPrintableModel(composePrintableGrid(createProject(1, 1))));
    assert.ok(readZipEntries(archive).has('3D/3dmodel.model'));
  } finally {
    globalThis.CompressionStream = original;
  }
});

test('image byte and decoded-pixel limits reject oversized input', () => {
  assert.throws(() => validateImageFileSize(MAX_IMAGE_FILE_BYTES + 1), /25 MB/);
  assert.throws(() => planImageConversion('image/png', 20_000, 20_000, 32, 3, 3), /dimensions are too large/);
});

test('production build uses minified Three and emits no source maps', () => {
  const vendor = 'generated/dist/vendor';
  assert.ok(statSync(`${vendor}/three.module.js`).size < 500_000);
  assert.ok(statSync(`${vendor}/three.core.min.js`).size < 500_000);
  assert.equal(readdirSync('generated/dist/src', { recursive: true }).some((file) => String(file).endsWith('.map')), false);
  assert.equal(existsSync('generated/dist/src/main.js'), true);
  assert.equal(existsSync('generated/dist/beadrelief-social-preview.jpg'), true);
});

test('image conversion cache timings are informational', (t) => {
  const width = 104;
  const repeated = new Uint8ClampedArray(width * width * 4);
  const gradient = new Uint8ClampedArray(width * width * 4);
  for (let i = 0; i < width * width; i += 1) {
    const offset = i * 4;
    repeated.set([32, 128, 224, 255], offset);
    gradient.set([i % 256, Math.floor(i / width) % 256, (i * 37) % 256, 255], offset);
  }
  const options = {
    width,
    maxColors: 32,
    palette,
    backgroundMode: 'keep',
    backgroundColor: [255, 255, 255],
    tolerance: 0,
    speckleReduction: 0,
    generationStyle: 'realistic',
  };
  const measure = (data) => {
    rgbaToBeads(data, width, width, width, width, options);
    const durations = [];
    for (let run = 0; run < 3; run += 1) {
      const start = performance.now();
      rgbaToBeads(data, width, width, width, width, options);
      durations.push(performance.now() - start);
    }
    return durations.sort((a, b) => a - b)[1];
  };
  const repeatedMedian = measure(repeated);
  const gradientMedian = measure(gradient);
  t.diagnostic(`104x104 realistic median: repeated=${repeatedMedian.toFixed(1)}ms, mostly-unique=${gradientMedian.toFixed(1)}ms`);
  assert.ok(Number.isFinite(repeatedMedian) && Number.isFinite(gradientMedian));
});
