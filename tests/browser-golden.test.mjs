import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { adjustLayerCells, applyEffectToLayer, defaultAdjustments } from '../generated/dist/src/imageAdjustments.js';
import { completePalette } from '../generated/dist/src/palette.js';
import { createProject } from '../generated/dist/src/project.js';
import { readZipEntries } from './helpers/zip.mjs';

const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const browserPath = browserCandidates.find(existsSync);

async function waitForServer(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForAsync(page, predicate, argument) {
  // Playwright's waitForFunction treats the returned Promise as truthy before it settles.
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await page.evaluate(predicate, argument)) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`Timed out waiting for ${predicate}`);
}

async function downloadFrom(page, buttonName, directory) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const download = await downloadPromise;
  const target = path.join(directory, download.suggestedFilename());
  await download.saveAs(target);
  return readFile(target);
}

test('3MF preflight preserves oversized projects and clamps print controls', { skip: !browserPath && !process.env.CI, timeout: 60_000 }, async () => {
  const port = 30_000 + (process.pid % 10_000);
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ['scripts/dev-server.cjs', String(port)], { stdio: 'ignore' });
  const directory = await mkdtemp(path.join(tmpdir(), 'beadrelief-preflight-'));
  let browser;
  try {
    await waitForServer(url);
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    const page = await browser.newPage();
    const errors = [];
    let downloads = 0;
    page.on('download', () => downloads++);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('perler-beads-generator:language', 'en'));
    await page.route('**/src/App.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text())
        .replace('setPreviewProject(project), 250)', 'setPreviewProject(project), 1500)')
        .replace('window.requestAnimationFrame(() => resolve())', 'window.requestAnimationFrame(() => window.exportFrameGate ? window.exportFrameGate.then(resolve) : resolve())') });
    });
    await page.route('**/src/print/model.js', async (route) => {
      const response = await route.fetch();
      const source = (await response.text()).replace('export function buildPrintableModel(', 'function originalBuildPrintableModel(');
      await route.fulfill({ response, body: `${source}\nexport function buildPrintableModel(grid) { if (grid.width > 32 || grid.height > 32) { window.oversizedBuilds = (window.oversizedBuilds || 0) + 1; throw new Error('Oversized geometry built'); } return originalBuildPrintableModel(grid); }` });
    });
    await page.goto(url);
    page.on('dialog', (dialog) => dialog.accept());
    for (const [width, height] of [[50, 50], [32, 33], [33, 32]]) {
      await page.getByRole('button', { name: 'Bead pattern', exact: true }).click();
      const imported = createProject(width, height);
      imported.layers[0].cells[0] = imported.amsColors[0].id;
      await page.locator('input[type="file"][accept="application/json,.json"]').first().setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
      await page.waitForFunction((width) => document.querySelector('input[aria-label="Canvas width"]').value === String(width), width);
      await page.getByRole('button', { name: '3D print', exact: true }).click();
      assert.equal(await page.getByLabel('Canvas width').inputValue(), String(width));
      assert.equal(await page.getByLabel('Canvas height').inputValue(), String(height));
      await page.locator('#print-export-errors').getByText('3MF supports up to 32 × 32 cells; larger projects can still use 2D exports.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Export 3MF', exact: true }).isDisabled(), true);
      const before = downloads;
      await page.getByRole('button', { name: 'Export 3MF', exact: true }).evaluate((button) => button.click());
      assert.equal(downloads, before);
      await page.getByRole('button', { name: '中', exact: true }).click();
      assert.match(await page.locator('#print-export-errors').textContent(), /3MF 最多支持 32 × 32 格/);
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      for (const label of ['Canvas width', 'Canvas height', 'Output long side']) assert.equal(await page.getByLabel(label).getAttribute('max'), '32');
      assert.equal(await page.getByRole('option', { name: '50 × 50', exact: true }).count(), 0);
      await page.getByLabel('Canvas width').fill('50');
      await page.getByLabel('Canvas height').fill('50');
      await page.getByRole('button', { name: 'Apply', exact: true }).evaluate((button) => button.click());
      assert.equal(await page.getByLabel('Canvas width').inputValue(), '32');
      assert.equal(await page.getByLabel('Canvas height').inputValue(), '32');
      assert.equal(await page.getByRole('button', { name: 'Export 3MF', exact: true }).isDisabled(), true);
      await page.waitForTimeout(1600);
      assert.equal(await page.getByRole('button', { name: 'Export 3MF', exact: true }).isEnabled(), true);
      const archive = readZipEntries(await downloadFrom(page, 'Export 3MF', directory));
      const xml = new TextDecoder().decode(zipEntry(archive, '3D/3dmodel.model'));
      const bounds = await page.evaluate((xml) => {
        const vertices = [...new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('vertex')];
        return ['x', 'y'].map((axis) => {
          let min = Infinity, max = -Infinity;
          for (const vertex of vertices) { const value = Number(vertex.getAttribute(axis)); min = Math.min(min, value); max = Math.max(max, value); }
          return max - min;
        });
      }, xml);
      assert.deepEqual(bounds, [32 * imported.printSettings.cellPitchMm, 32 * imported.printSettings.cellPitchMm]);
    }
    await page.getByRole('button', { name: 'Bead pattern', exact: true }).click();
    await page.getByLabel('Output long side').fill('50');
    await page.locator('input[type="file"][accept^="image/png"]').first().setInputFiles(path.join(process.cwd(), 'samples/beadrelief-heart-source.png'));
    await waitForAsync(page, async () => (await (await import('/src/project.js')).loadDraft())?.width === 50);
    await page.getByRole('button', { name: '3D print', exact: true }).click();
    await page.waitForTimeout(800);
    assert.equal(await page.getByLabel('Canvas width').inputValue(), '50');
    assert.equal(await page.getByRole('button', { name: 'Export 3MF', exact: true }).isDisabled(), true);
    await page.getByLabel('Output long side').fill('60');
    await waitForAsync(page, async () => (await (await import('/src/project.js')).loadDraft())?.width === 32);
    assert.equal(await page.getByLabel('Canvas height').inputValue(), '32');
    await page.waitForTimeout(1600);
    // Hold the export's animation-frame yield while replacing its input snapshot.
    await page.evaluate(() => { window.exportFrameGate = new Promise((resolve) => { window.releaseExport = resolve; }); });
    const before = downloads;
    await page.getByRole('button', { name: 'Export 3MF', exact: true }).click();
    const oversized = createProject(50, 50);
    await page.locator('input[type="file"][accept="application/json,.json"]').first().setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oversized)) });
    await page.waitForFunction(() => document.querySelector('input[aria-label="Canvas width"]').value === '50');
    await page.evaluate(() => window.releaseExport());
    await page.getByRole('status', { name: 'Workspace status' }).getByText('3MF supports up to 32 × 32 cells; larger projects can still use 2D exports.', { exact: true }).waitFor();
    assert.equal(downloads, before);
    assert.equal(await page.evaluate(() => window.oversizedBuilds || 0), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

function zipEntry(entries, name) {
  const entry = entries.get(name);
  assert.ok(entry, `missing ZIP entry ${name}`);
  return entry;
}

async function assertExportedXml(page, threeMfEntries, xlsxEntries) {
  const modelXml = new TextDecoder().decode(zipEntry(threeMfEntries, '3D/3dmodel.model'));
  const workbookXml = new TextDecoder().decode(zipEntry(xlsxEntries, 'xl/workbook.xml'));
  const workbookRelsXml = new TextDecoder().decode(zipEntry(xlsxEntries, 'xl/_rels/workbook.xml.rels'));
  const worksheetXml = [...xlsxEntries]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .map(([, data]) => new TextDecoder().decode(data));
  assert.ok(worksheetXml.length > 0, 'XLSX has no worksheets');

  await page.evaluate(({ modelXml, workbookXml, workbookRelsXml, worksheetXml }) => {
    const parse = (xml, name) => {
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      if (document.getElementsByTagName('parsererror').length > 0) throw new Error(`${name} has a parser error`);
      return document;
    };
    const model = parse(modelXml, '3MF model').documentElement;
    if (model.localName !== 'model' || model.getAttribute('unit') !== 'millimeter') {
      throw new Error('3MF model must use millimeter units');
    }
    if (model.getElementsByTagNameNS(model.namespaceURI, 'resources').length !== 1
      || model.getElementsByTagNameNS(model.namespaceURI, 'build').length !== 1) {
      throw new Error('3MF model must include resources and build');
    }
    const workbook = parse(workbookXml, 'XLSX workbook');
    parse(workbookRelsXml, 'XLSX workbook relationships');
    worksheetXml.forEach((xml, index) => parse(xml, `XLSX worksheet ${index + 1}`));
    const sheetCount = workbook.documentElement
      .getElementsByTagNameNS(workbook.documentElement.namespaceURI, 'sheet').length;
    if (sheetCount !== worksheetXml.length) throw new Error('XLSX sheet count does not match worksheet entries');
  }, { modelXml, workbookXml, workbookRelsXml, worksheetXml });
}

test('heart PNG golden path edits and downloads every export', { skip: !browserPath && !process.env.CI, timeout: 60_000 }, async () => {
  assert.ok(browserPath, 'Chrome or Chromium is required in CI');
  const port = 20_000 + (process.pid % 10_000);
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ['scripts/dev-server.cjs', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  const directory = await mkdtemp(path.join(tmpdir(), 'beadrelief-e2e-'));
  let browser;

  try {
    await waitForServer(url);
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1366, height: 768 } });
    const browserErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('perler-beads-generator:language', 'en');
    });

    await page.goto(url);
    await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 5_000 }).catch((error) => {
      throw new Error(`${browserErrors.join('\n')}\n${error.message}`);
    });
    await page.setViewportSize({ width: 980, height: 768 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1366, height: 768 });
    const status = page.getByRole('status', { name: 'Workspace status' });
    assert.equal(await status.getAttribute('aria-live'), 'polite');
    assert.equal(await status.getAttribute('aria-atomic'), 'true');
    const paletteTab = page.getByRole('tab', { name: 'Palette', exact: true });
    assert.equal(await paletteTab.getAttribute('aria-controls'), 'right-panel-palette');
    assert.equal(await page.getByRole('tabpanel', { name: 'Palette', exact: true }).count(), 1);
    await paletteTab.focus();
    await page.keyboard.press('ArrowRight');
    const layersTab = page.getByRole('tab', { name: 'Layers', exact: true });
    assert.equal(await layersTab.getAttribute('aria-selected'), 'true');
    await expectFocused(page, layersTab);
    await page.keyboard.press('ArrowLeft');
    await page.getByRole('button', { name: '中', exact: true }).click();
    assert.equal(await page.getByLabel('画布宽度').count(), 1);
    assert.equal(await page.getByRole('tablist', { name: '右侧面板' }).count(), 1);
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    const helpButton = page.getByRole('button', { name: 'Help', exact: true });
    await helpButton.click();
    const helpDialog = page.getByRole('dialog', { name: 'Quick start & help' });
    assert.equal(await helpDialog.evaluate((dialog) => dialog.open), true);
    assert.equal(await helpDialog.locator('ol > li').count(), 4);
    await page.keyboard.press('Escape');
    await expectFocused(page, helpButton);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    const unnamedInteractive = await page.locator('button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])').evaluateAll((elements) => {
      function accessibleName(element) {
        const labelledBy = element.getAttribute('aria-labelledby')
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ');
        return element.getAttribute('aria-label')
          || labelledBy
          || [...(element.labels ?? [])].map((label) => label.textContent?.trim() ?? '').filter(Boolean).join(' ')
          || element.getAttribute('title')
          || element.textContent?.trim()
          || '';
      }
      return elements
        .filter((element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'))
        .filter((element) => !accessibleName(element))
        .map((element) => element.outerHTML.slice(0, 200));
    });
    assert.deepEqual(unnamedInteractive, []);
    assert.equal(await page.getByRole('button', { name: 'Bead pattern', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Export 3MF', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Pattern color limit').inputValue(), '291');
    assert.equal(await page.getByLabel('Pattern color limit').getAttribute('max'), '291');
    assert.equal(await page.getByLabel('Style').inputValue(), 'realistic');
    assert.equal(await page.getByLabel('Canvas width').getAttribute('max'), '180');
    assert.deepEqual(await page.locator('.canvas-preset-select option').allTextContents(), [
      'Common sizes',
      '15 × 15',
      '29 × 29',
      '52 × 52',
      '78 × 78',
      '104 × 104',
    ]);
    assert.deepEqual(await page.locator('.readonly-brand-field select option').allTextContents(), [
      'MARD Basic (221 colors)',
      'MARD Complete (291 colors)',
    ]);
    await page.locator('input[type="file"][accept^="image/png"]').first().setInputFiles(
      path.join(process.cwd(), 'samples/beadrelief-heart-source.png'),
    );
    await page.getByText(/editable pattern ready\.$/).waitFor();
    assert.equal(await page.locator('.swatch').count(), 291);
    await waitForAsync(page, async () => {
      const draft = await (await import('/src/project.js')).loadDraft();
      return draft?.layers.some((layer) => layer.cells.some(Boolean)) && draft.layers.every((layer) => layer.cells.every((cell) => !cell || cell.startsWith('mard-')));
    });
    const patternDraft = await page.evaluate(async () => (await import('/src/project.js')).loadDraft());
    assert.ok(patternDraft.layers.flatMap((layer) => layer.cells).filter(Boolean).every((cell) => cell.startsWith('mard-')));

    await page.getByRole('button', { name: '3D print', exact: true }).click();
    await waitForAsync(page, async () => {
      const draft = await (await import('/src/project.js')).loadDraft();
      return draft.layers.every((layer) => layer.cells.every((cell) => cell === null || cell.startsWith('ams-')));
    });
    assert.equal(await page.getByRole('button', { name: 'Export 3MF', exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Pattern color limit').count(), 0);
    assert.equal(await page.locator('.swatch').count(), 3);

    const beforeEdit = await page.evaluate(async () => (await import('/src/project.js')).loadDraft());
    await page.locator('.swatch').nth(1).click();
    const canvas = page.locator('.workspace canvas');
    const box = await canvas.boundingBox();
    assert.ok(box);
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await waitForAsync(page, async ({ cells, color }) => {
      const draft = await (await import('/src/project.js')).loadDraft();
      return draft.cells.some((cell, index) => cell === color && cells[index] !== color);
    }, {
      cells: beforeEdit.cells,
      color: beforeEdit.amsColors[1].id,
    });

    const railIsScrollable = await page.locator('.tool-rail').evaluate((rail) => {
      const buttons = rail.querySelectorAll('button');
      const lastButton = buttons[buttons.length - 1];
      lastButton?.scrollIntoView({ block: 'end' });
      const railBounds = rail.getBoundingClientRect();
      const buttonBounds = lastButton?.getBoundingClientRect();
      return rail.scrollHeight > rail.clientHeight
        && Boolean(buttonBounds && buttonBounds.bottom <= railBounds.bottom && buttonBounds.top >= railBounds.top);
    });
    assert.equal(railIsScrollable, true);
    assert.equal(await page.getByLabel('Background tolerance').count(), 0);
    assert.equal(await page.getByLabel('Reference opacity').inputValue(), '0.35');

    let downloadCount = 0;
    page.on('download', () => { downloadCount += 1; });
    await page.getByLabel('AMS layered', { exact: true }).check();
    await page.getByLabel('Border (mm)', { exact: true }).fill('1');
    const layeredBorderText = 'Layered mode does not support borders yet. Set border width to 0 mm.';
    const layeredBorderMessage = page.locator('#print-export-errors').getByText(layeredBorderText, { exact: true });
    await layeredBorderMessage.waitFor();
    const layeredExport = page.getByRole('button', { name: 'Export AMS multi-part 3MF', exact: true });
    assert.equal(await layeredExport.isDisabled(), true);
    await page.getByRole('button', { name: 'Export 3MF', exact: true }).click();
    await status.getByText(layeredBorderText, { exact: true }).waitFor();
    await page.waitForTimeout(100);
    assert.equal(downloadCount, 0);
    await page.getByLabel('Border (mm)', { exact: true }).fill('0');
    await layeredBorderMessage.waitFor({ state: 'detached' });
    assert.equal(await layeredExport.isEnabled(), true);
    await downloadFrom(page, 'Export AMS multi-part 3MF', directory);
    assert.equal(downloadCount, 1);
    await page.getByLabel('Solid colors', { exact: true }).check();

    await page.waitForTimeout(450);
    await canvas.focus();
    const coordinateBefore = await page.locator('.canvas-coordinate-status').textContent();
    await page.keyboard.press('ArrowRight');
    const coordinate = page.locator('.canvas-coordinate-status');
    const x = Number(await coordinate.getAttribute('data-x'));
    const y = Number(await coordinate.getAttribute('data-y'));
    const draftBeforeKeyboard = await page.evaluate(async () => (await import('/src/project.js')).loadDraft());
    const activeLayer = draftBeforeKeyboard.layers.find((layer) => layer.id === draftBeforeKeyboard.activeLayerId);
    const differentSlot = draftBeforeKeyboard.amsColors.findIndex((color) => color.id !== activeLayer.cells[y * draftBeforeKeyboard.width + x]);
    await page.locator('.swatch').nth(differentSlot).click();
    await canvas.focus();
    await page.keyboard.press('Enter');
    await waitForAsync(page,
      async ({ x, y, color }) => {
        const draft = await (await import('/src/project.js')).loadDraft();
        return draft.layers.find((layer) => layer.id === draft.activeLayerId).cells[y * draft.width + x] === color;
      },
      { x, y, color: draftBeforeKeyboard.amsColors[differentSlot].id },
    );
    assert.notEqual(await page.locator('.canvas-coordinate-status').textContent(), coordinateBefore);
    await page.keyboard.press('Delete');

    const expand = page.getByTitle('Expand 3D preview');
    await expand.click();
    assert.equal(await page.locator('dialog.three-preview-modal').evaluate((dialog) => dialog.open), true);
    await page.keyboard.press('Escape');
    await expectFocused(page, expand);

    const json = await downloadFrom(page, 'Export edit', directory);
    const draft = JSON.parse(json.toString('utf8'));
    assert.ok(draft.width > 0 && draft.height > 0 && draft.layers.length > 0);

    const threeMf = await downloadFrom(page, 'Export 3MF', directory);
    const threeMfEntries = readZipEntries(threeMf);
    assert.deepEqual([...threeMfEntries.keys()], [
      '[Content_Types].xml',
      '_rels/.rels',
      '3D/3dmodel.model',
      'Metadata/project_settings.config',
      'Metadata/model_settings.config',
      'Metadata/beadrelief_recipe.config',
    ]);
    const corruptedLocalCrc = Uint8Array.from(threeMf);
    corruptedLocalCrc[14] ^= 0xff;
    assert.throws(() => readZipEntries(corruptedLocalCrc), /CRC/i);
    const archiveView = new DataView(threeMf.buffer, threeMf.byteOffset, threeMf.byteLength);
    const eocdOffset = threeMf.byteLength - 22 - archiveView.getUint16(threeMf.byteLength - 2, true);
    const centralDirectoryOffset = archiveView.getUint32(eocdOffset + 16, true);
    const corruptedCentralCrc = Uint8Array.from(threeMf);
    corruptedCentralCrc[centralDirectoryOffset + 16] ^= 0xff;
    assert.throws(() => readZipEntries(corruptedCentralCrc), /CRC/i);

    const xlsx = await downloadFrom(page, 'Export usage', directory);
    const xlsxEntries = readZipEntries(xlsx);
    for (const name of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
    ]) zipEntry(xlsxEntries, name);
    assert.ok([...xlsxEntries.keys()].some((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)));
    await assertExportedXml(page, threeMfEntries, xlsxEntries);

    await page.getByRole('button', { name: 'Export pattern', exact: true }).click();
    await page.locator('.export-format-select').first().selectOption('png');
    await downloadFrom(page, 'Export PNG', directory);
    await page.getByText('PNG pattern exported.', { exact: true }).waitFor();
    const exportPatternButton = page.getByRole('button', { name: 'Export pattern', exact: true });
    await expectFocused(page, exportPatternButton);

    await exportPatternButton.click();
    assert.equal(await page.getByRole('dialog', { name: 'Pattern settings' }).count(), 1);
    await page.keyboard.press('Escape');
    await expectFocused(page, exportPatternButton);
    await exportPatternButton.click();
    await page.locator('.export-format-select').first().selectOption('pdf');
    await downloadFrom(page, 'Export PDF', directory);
    await page.getByText('PDF pattern exported.', { exact: true }).waitFor();

    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    await page.getByRole('button', { name: 'New layer', exact: true }).click();
    assert.equal(await page.locator('.layer-select-button').count(), 2);
    await page.locator('button[aria-label="Move layer down"]:not(:disabled)').click();

    await page.getByLabel('Canvas width').fill('32');
    await page.getByLabel('Canvas height').fill('32');
    await page.getByRole('button', { name: 'Apply', exact: true }).evaluate((button) => button.click());
    await page.waitForTimeout(350);
    const editLongTasks = await page.locator('.workspace canvas').evaluate(async (element) => {
      const durations = [];
      const observer = new PerformanceObserver((list) => {
        durations.push(...list.getEntries().map((entry) => entry.duration));
      });
      observer.observe({ type: 'longtask', buffered: false });
      const canvas = element;
      const bounds = canvas.getBoundingClientRect();
      for (let index = 0; index < 12; index += 1) {
        const init = {
          bubbles: true,
          pointerId: 1,
          isPrimary: true,
          clientX: bounds.left + bounds.width * (0.2 + index * 0.04),
          clientY: bounds.top + bounds.height * 0.5,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        await new Promise(requestAnimationFrame);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      observer.disconnect();
      return durations;
    });
    if (!process.env.CI) assert.ok(editLongTasks.every((duration) => duration <= 50), `edit long tasks: ${editLongTasks.join(', ')}`);

    await page.getByRole('button', { name: 'Bead pattern', exact: true }).click();
    await page.getByLabel('Canvas width').fill('180');
    await page.getByLabel('Canvas height').fill('180');
    await page.getByRole('button', { name: 'Apply', exact: true }).evaluate((button) => button.click());
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: 'Fill', exact: true }).click();
    const fillLongTasks = await page.locator('.workspace canvas').evaluate(async (element) => {
      const durations = [];
      const observer = new PerformanceObserver((list) => {
        durations.push(...list.getEntries().map((entry) => entry.duration));
      });
      observer.observe({ type: 'longtask', buffered: false });
      const canvas = element;
      const bounds = canvas.getBoundingClientRect();
      const init = {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        clientX: bounds.left + bounds.width * 0.5,
        clientY: bounds.top + bounds.height * 0.2,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      observer.disconnect();
      return durations;
    });
    if (!process.env.CI) assert.ok(fillLongTasks.every((duration) => duration <= 50), `pattern fill long tasks: ${fillLongTasks.join(', ')}`);
    await page.getByRole('button', { name: 'Pencil', exact: true }).click();
    const patternLongTasks = await page.locator('.workspace canvas').evaluate(async (element) => {
      const durations = [];
      const observer = new PerformanceObserver((list) => {
        durations.push(...list.getEntries().map((entry) => entry.duration));
      });
      observer.observe({ type: 'longtask', buffered: false });
      const canvas = element;
      const bounds = canvas.getBoundingClientRect();
      for (let index = 0; index < 12; index += 1) {
        const init = {
          bubbles: true,
          pointerId: 1,
          isPrimary: true,
          clientX: bounds.left + bounds.width * (0.2 + index * 0.04),
          clientY: bounds.top + bounds.height * 0.5,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
        await new Promise(requestAnimationFrame);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      observer.disconnect();
      return durations;
    });
    if (!process.env.CI) assert.ok(patternLongTasks.every((duration) => duration <= 50), `pattern edit long tasks: ${patternLongTasks.join(', ')}`);
    assert.deepEqual(browserErrors, []);
  } finally {
    await browser?.close();
    server.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

test('adjustments use the latest edited cells and one history entry per session', { skip: !browserPath && !process.env.CI, timeout: 60_000 }, async () => {
  assert.ok(browserPath, 'Chrome or Chromium is required in CI');
  const port = 30_000 + (process.pid % 10_000);
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ['scripts/dev-server.cjs', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  let browser;

  const initialCells = Array.from({ length: 64 }, (_, index) => (
    index === 1 ? null : ['mard-f5', 'mard-c8', 'mard-b8', 'mard-g7', 'mard-h5'][index % 5]
  ));
  const seed = createProject(8, 8, 'Adjustment regression');
  seed.cells = initialCells.slice();
  seed.layers[0].cells = initialCells.slice();

  async function openFixture() {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('perler-beads-generator:language', 'en');
    });
    await page.route(url, (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto(url);
    await page.evaluate(async (draft) => (await import('/src/project.js')).saveDraft(draft), seed);
    await page.unroute(url);
    await page.goto(url);
    await page.locator('.workspace canvas').waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Canvas width"]')?.value === '8');
    return { context, page };
  }

  async function savedCells(page) {
    return page.evaluate(async () => (await (await import('/src/project.js')).loadDraft()).layers[0].cells);
  }

  async function waitForCells(page, cells) {
    await waitForAsync(page, async (expected) => {
      const draft = await (await import('/src/project.js')).loadDraft();
      return JSON.stringify(draft.layers[0].cells) === JSON.stringify(expected);
    }, cells);
  }

  async function setBrightness(page, value, baseline = initialCells) {
    await page.getByRole('tab', { name: 'Adjust', exact: true }).click();
    await page.getByLabel('Brightness').fill(String(value));
    await waitForCells(page, adjustLayerCells(baseline, { ...defaultAdjustments, brightness: value }, completePalette));
  }

  async function assertNextAdjustment(page, baseline) {
    const expected = adjustLayerCells(baseline, { ...defaultAdjustments, brightness: 2 }, completePalette);
    await setBrightness(page, 2, baseline);
    await waitForCells(page, expected);
    assert.deepEqual(await savedCells(page), expected, `baseline ${baseline.filter(Boolean).length}, brightness ${await page.getByLabel('Brightness').inputValue()}`);
  }

  try {
    await waitForServer(url);
    browser = await chromium.launch({ executablePath: browserPath, headless: true });

    {
      const { context, page } = await openFixture();
      await setBrightness(page, 1);
      const canvas = page.locator('.workspace canvas');
      await canvas.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await waitForAsync(page, async () => {
        const draft = await (await import('/src/project.js')).loadDraft();
        return Boolean(draft && draft.layers[0].cells[1] !== null);
      });
      const afterPaint = await savedCells(page);
      await assertNextAdjustment(page, afterPaint);
      await context.close();
    }

    {
      const { context, page } = await openFixture();
      await setBrightness(page, 1);
      await page.locator('.project-action-button').filter({ hasText: /^Clear$/ }).evaluate((button) => button.click());
      const cleared = Array(64).fill(null);
      await waitForCells(page, cleared);
      await assertNextAdjustment(page, cleared);
      await context.close();
    }

    {
      const { context, page } = await openFixture();
      await setBrightness(page, 1);
      const beforeInvert = await savedCells(page);
      const inverted = applyEffectToLayer(beforeInvert, completePalette, 'invert').cells;
      await page.getByRole('button', { name: 'Invert', exact: true }).click();
      await waitForCells(page, inverted);
      await assertNextAdjustment(page, inverted);
      await context.close();
    }

    {
      const { context, page } = await openFixture();
      await setBrightness(page, 1);
      await page.getByRole('button', { name: 'Undo', exact: true }).evaluate((button) => button.click());
      await waitForCells(page, initialCells);
      await assertNextAdjustment(page, initialCells);
      await context.close();
    }

    {
      const { context, page } = await openFixture();
      await setBrightness(page, 1);
      const adjusted = await savedCells(page);
      await page.getByRole('button', { name: 'Undo', exact: true }).evaluate((button) => button.click());
      await waitForCells(page, initialCells);
      await page.getByRole('button', { name: 'Redo', exact: true }).evaluate((button) => button.click());
      await waitForCells(page, adjusted);
      await assertNextAdjustment(page, adjusted);
      await context.close();
    }

    {
      const { context, page } = await openFixture();
      await setBrightness(page, 1);
      await setBrightness(page, 2);
      await page.getByRole('button', { name: 'Undo', exact: true }).evaluate((button) => button.click());
      await waitForCells(page, initialCells);
      assert.deepEqual(await savedCells(page), initialCells);
      await context.close();
    }

    {
      const { context, page } = await openFixture();
      const canvas = page.locator('.workspace canvas');
      await canvas.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await waitForAsync(page, async () => (await (await import('/src/project.js')).loadDraft()).layers[0].cells[1] !== null);
      const afterPaint = await savedCells(page);
      await setBrightness(page, 2, afterPaint);
      await page.getByRole('button', { name: 'Reset adjustments', exact: true }).click();
      await waitForCells(page, afterPaint);
      assert.deepEqual(await savedCells(page), afterPaint);
      await context.close();
    }

    {
      const { context, page } = await openFixture();
      await setBrightness(page, 1);
      page.on('dialog', (dialog) => void dialog.accept());
      await page.getByLabel('Output long side').fill('8');
      const beforeGeneration = await savedCells(page);
      await page.locator('input[type="file"][accept^="image/png"]').first().setInputFiles(
        path.join(process.cwd(), 'samples/beadrelief-heart-source.png'),
      );
      await page.getByText(/editable pattern ready\.$/).waitFor();
      await waitForAsync(page, async (before) => {
        const draft = await (await import('/src/project.js')).loadDraft();
        return JSON.stringify(draft.layers[0].cells) !== JSON.stringify(before);
      }, beforeGeneration);
      const generated = await savedCells(page);
      await assertNextAdjustment(page, generated);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.kill();
  }
});

test('large IndexedDB drafts survive reload intact', { skip: !browserPath && !process.env.CI, timeout: 60_000 }, async () => {
  const port = 40_000 + (process.pid % 10_000);
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ['scripts/dev-server.cjs', String(port)], { stdio: 'ignore' });
  let browser;
  try {
    await waitForServer(url);
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    const page = await browser.newPage();
    await page.goto(url);
    await waitForAsync(page, async () => (await (await import('/src/project.js')).loadDraft())?.width === 32);
    const result = await page.evaluate(async () => {
      const { createProject, saveDraft } = await import('/src/project.js');
      const project = createProject(180, 180, 'Large draft');
      project.layers = Array.from({ length: 16 }, (_, index) => ({
        ...project.layers[0], id: `layer-${index}`, name: `Layer ${index + 1}`,
        cells: Array(180 * 180).fill(project.amsColors[index % project.amsColors.length].id),
      }));
      project.activeLayerId = project.layers[15].id;
      project.cells = project.layers[15].cells;
      return { bytes: new Blob([JSON.stringify(project)]).size, saved: await saveDraft(project) };
    });
    assert.ok(result.bytes > 5 * 1024 * 1024, `${result.bytes} bytes`);
    assert.equal(result.saved, true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[aria-label="Canvas width"]')?.value === '180');
    assert.equal(await page.getByLabel('Canvas height').inputValue(), '180');
    await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    assert.equal(await page.locator('.layer-select-button').count(), 16);
    assert.equal(await page.evaluate(async () => {
      const project = await (await import('/src/project.js')).loadDraft();
      return project.layers.length === 16 && project.layers.every((layer, index) =>
        layer.id === `layer-${index}` && layer.cells.length === 32400
        && layer.cells.every((cell) => cell === project.amsColors[index % project.amsColors.length].id));
    }), true);
  } finally {
    await browser?.close();
    server.kill();
  }
});

test('draft storage handles migration, failures and ordered transactions', { skip: !browserPath && !process.env.CI, timeout: 60_000 }, async (t) => {
  const port = 40_000 + (process.pid % 10_000);
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ['scripts/dev-server.cjs', String(port)], { stdio: 'ignore' });
  let browser;
  try {
    await waitForServer(url);
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    for (const scenario of ['migration', 'authoritative', 'invalid', 'missing', 'open-error', 'request-error', 'blocked', 'late-open', 'write-error', 'abort', 'read-abort', 'migration-failure', 'ordered', 'versionchange']) {
      await t.test(scenario, async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.route(url, (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
        await page.goto(url);
        const result = await page.evaluate(async (scenario) => {
          const { createProject, saveDraft, loadDraft, autosaveKey } = await import('/src/project.js');
          const project = createProject(8, 8, 'Legacy draft');
          project.cells[0] = project.layers[0].cells[0] = 'mard-f5';
          const raw = JSON.stringify(project);
          const originalTransaction = IDBDatabase.prototype.transaction;
          if (['migration', 'authoritative', 'invalid', 'read-abort', 'migration-failure', 'missing', 'open-error', 'blocked'].includes(scenario)) localStorage.setItem(autosaveKey, raw);
          if (scenario === 'missing') Object.defineProperty(window, 'indexedDB', { value: undefined });
          if (scenario === 'open-error') indexedDB.open = () => { throw new DOMException('Unavailable', 'SecurityError'); };
          if (scenario === 'request-error') indexedDB.open = () => {
            const request = { error: new DOMException('Unavailable', 'UnknownError') };
            setTimeout(() => request.onerror(), 0);
            return request;
          };
          if (scenario === 'late-open') {
            let closed = false;
            indexedDB.open = () => {
              const request = { result: { close: () => { closed = true; } } };
              setTimeout(() => { request.onblocked(); request.onsuccess(); }, 0);
              return request;
            };
            return { saved: await saveDraft(project), closed };
          }
          if (scenario === 'blocked') indexedDB.open = () => {
            const request = {};
            setTimeout(() => request.onblocked(), 0);
            return request;
          };
          if (['authoritative', 'invalid', 'read-abort', 'abort', 'write-error', 'versionchange'].includes(scenario)) {
            await saveDraft({ ...project, name: 'Database draft' });
          }
          if (scenario === 'invalid') {
            const request = indexedDB.open('beadrelief', 1);
            await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = reject; });
            const tx = request.result.transaction('drafts', 'readwrite');
            tx.objectStore('drafts').put({ width: 900, height: 8, cells: [] }, autosaveKey);
            await new Promise((resolve) => { tx.oncomplete = resolve; });
            request.result.close();
          }
          if (['abort', 'write-error', 'read-abort', 'migration-failure'].includes(scenario)) {
            IDBDatabase.prototype.transaction = function (...args) {
              const tx = originalTransaction.apply(this, args);
              if ((scenario === 'read-abort') === (args[1] === 'readonly')) {
                if (scenario === 'write-error') {
                  tx.objectStore('drafts').add('duplicate', autosaveKey);
                } else {
                  // Abort after the request succeeds: request success alone is not durable.
                  const method = args[1] === 'readonly' ? 'get' : 'put';
                  const original = IDBObjectStore.prototype[method];
                  const store = tx.objectStore('drafts');
                  store[method] = function (...values) {
                    const request = original.apply(this, values);
                    request.addEventListener('success', () => tx.abort());
                    return request;
                  };
                  tx.objectStore = () => store;
                }
              }
              return tx;
            };
          }
          if (scenario === 'ordered') {
            const saved = await Promise.all(Array.from({ length: 12 }, (_, index) => saveDraft({ ...project, name: `Write ${index}` })));
            return { saved, name: (await loadDraft()).name };
          }
          if (scenario === 'versionchange') {
            const request = indexedDB.open('beadrelief', 2);
            await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = reject; request.onblocked = () => reject(new Error('connection not closed')); });
            request.result.close();
            // Version 1 is now unavailable; the stale cached connection must not be used.
            return { saved: await saveDraft(project) };
          }
          if (['abort', 'write-error'].includes(scenario)) {
            const saved = await saveDraft({ ...project, name: 'Failed draft' });
            IDBDatabase.prototype.transaction = originalTransaction;
            return { saved, name: (await loadDraft()).name, legacy: localStorage.getItem(autosaveKey) };
          }
          const draft = await loadDraft();
          return { name: draft?.name, legacy: localStorage.getItem(autosaveKey), raw,
            saved: ['missing', 'open-error', 'request-error', 'blocked'].includes(scenario) ? await saveDraft(project) : undefined };
        }, scenario);
        if (scenario === 'ordered') {
          assert.deepEqual(result.saved, Array(12).fill(true));
          assert.equal(result.name, 'Write 11');
        } else if (scenario === 'versionchange') assert.equal(result.saved, false);
        else if (scenario === 'late-open') assert.deepEqual(result, { saved: false, closed: true });
        else if (scenario === 'request-error') {
          assert.equal(result.name, undefined);
          assert.equal(result.saved, false);
          assert.equal(result.legacy, null);
        }
        else if (['abort', 'write-error'].includes(scenario)) {
          assert.equal(result.saved, false);
          assert.equal(result.name, 'Database draft');
          assert.equal(result.legacy, null);
        } else {
          assert.equal(result.name, scenario === 'authoritative' ? 'Database draft' : 'Legacy draft');
          assert.equal(result.legacy, ['migration', 'invalid', 'read-abort'].includes(scenario) ? null : result.raw);
          if (['missing', 'open-error', 'blocked'].includes(scenario)) assert.equal(result.saved, false);
        }
        await context.close();
      });
    }
  } finally {
    await browser?.close();
    server.kill();
  }
});

test('restoration gates autosave and protects early edits during StrictMode replay', { skip: !browserPath && !process.env.CI, timeout: 60_000 }, async (t) => {
  const port = 40_000 + (process.pid % 10_000);
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ['scripts/dev-server.cjs', String(port)], { stdio: 'ignore' });
  let browser;
  try {
    await waitForServer(url);
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
    for (const earlyEdit of [false, true]) await t.test(earlyEdit ? 'early edit' : 'delayed restore', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route(url, (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
      await page.goto(url);
      await page.evaluate(async () => {
        const { createProject, saveDraft } = await import('/src/project.js');
        await saveDraft(createProject(8, 8, 'Existing draft'));
      });
      await page.unroute(url);
      for (const [bundle, file] of [['react', 'react/umd/react.development.js'], ['react-dom', 'react-dom/umd/react-dom.development.js']]) {
        await page.route(`**/vendor/${bundle}.production.min.js`, (route) => route.fulfill({ path: path.join(process.cwd(), 'node_modules', file), contentType: 'text/javascript' }));
      }
      await page.route('**/src/project.js', async (route) => {
        const response = await route.fetch();
        const source = (await response.text()).replace(/export (async )?function loadDraft\(/, 'async function originalLoadDraft(');
        await route.fulfill({ response, body: `${source}\nexport async function loadDraft() { window.loadCalls++; await window.draftGate; return originalLoadDraft(); }` });
      });
      await page.addInitScript(() => {
        localStorage.setItem('perler-beads-generator:language', 'en');
        // Initial project and early edit deliberately share a timestamp.
        const OriginalDate = Date;
        window.Date = class extends OriginalDate {
          constructor(...args) { super(...(args.length ? args : ['2026-01-01T00:00:00.000Z'])); }
          static now() { return 1767225600000; }
        };
        window.loadCalls = 0;
        window.draftGate = new Promise((resolve) => { window.releaseDraft = resolve; });
        window.draftWrites = [];
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, ...args) {
          window.draftWrites.push({ width: value.width, name: value.name });
          return put.call(this, value, ...args);
        };
      });
      await page.goto(url);
      await page.locator('.workspace canvas').waitFor();
      await page.waitForFunction(() => window.loadCalls === 2);
      if (earlyEdit) {
        await page.getByLabel('Canvas width').fill('12');
        await page.getByRole('button', { name: 'Apply', exact: true }).evaluate((button) => button.click());
      }
      await page.waitForTimeout(700);
      assert.deepEqual(await page.evaluate(() => window.draftWrites), []);
      assert.equal(await page.evaluate(async () => {
        const request = indexedDB.open('beadrelief', 1);
        await new Promise((resolve) => { request.onsuccess = resolve; });
        const read = request.result.transaction('drafts').objectStore('drafts').get('perler-beads-generator:draft');
        const value = await new Promise((resolve) => { read.onsuccess = () => resolve(read.result); });
        request.result.close();
        return value.width;
      }), 8);
      await page.evaluate(() => window.releaseDraft());
      await waitForAsync(page, async (width) => (await (await import('/src/project.js')).loadDraft())?.width === width, earlyEdit ? 12 : 8);
      await page.waitForFunction((width) => window.draftWrites.some((draft) => draft.width === width), earlyEdit ? 12 : 8);
      assert.equal(await page.getByLabel('Canvas width').inputValue(), earlyEdit ? '12' : '8');
      assert.ok((await page.evaluate(() => window.draftWrites)).every((draft) => draft.width === (earlyEdit ? 12 : 8)));
      await context.close();
    });
    await t.test('persistent bilingual failure status', async () => {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        localStorage.setItem('perler-beads-generator:language', 'en');
        Object.defineProperty(window, 'indexedDB', { value: undefined });
      });
      const page = await context.newPage();
      await page.goto(url);
      const status = page.getByRole('status', { name: 'Draft save status' });
      await status.getByText('Browser storage is unavailable; this session will not be saved.', { exact: true }).waitFor();
      await page.getByLabel('Canvas width').fill('12');
      await page.getByRole('button', { name: 'Apply', exact: true }).evaluate((button) => button.click());
      await page.waitForTimeout(800);
      assert.match(await status.textContent(), /will not be saved/);
      assert.equal(await page.getByLabel('Canvas width').inputValue(), '12');
      await page.getByRole('button', { name: '中', exact: true }).click();
      await page.getByRole('status', { name: '草稿保存状态' }).getByText('浏览器存储不可用；本次会话不会保存。', { exact: true }).waitFor();
      await context.close();
    });
    await t.test('only the current save completion can change failure status', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(() => {
        localStorage.setItem('perler-beads-generator:language', 'en');
        window.pendingSaves = [];
      });
      await page.route('**/src/project.js', async (route) => {
        const response = await route.fetch();
        const source = (await response.text()).replace('export async function saveDraft(', 'async function originalSaveDraft(');
        await route.fulfill({ response, body: `${source}\nexport async function saveDraft(project) { await originalSaveDraft(project); return new Promise(resolve => window.pendingSaves.push(resolve)); }` });
      });
      await page.goto(url);
      await page.waitForFunction(() => window.pendingSaves.length === 1);
      await page.evaluate(() => window.pendingSaves[0](false));
      const status = page.getByRole('status', { name: 'Draft save status' });
      await status.getByText('Browser storage is unavailable; this session will not be saved.', { exact: true }).waitFor();
      for (const width of [12, 13]) {
        await page.getByLabel('Canvas width').fill(String(width));
        await page.getByRole('button', { name: 'Apply', exact: true }).evaluate((button) => button.click());
        await page.waitForFunction((count) => window.pendingSaves.length === count, width - 10);
      }
      await page.evaluate(() => window.pendingSaves[2](false));
      await page.evaluate(() => window.pendingSaves[1](true));
      await page.waitForTimeout(100);
      assert.match(await status.textContent(), /will not be saved/);
      await page.getByLabel('Canvas width').fill('14');
      await page.getByRole('button', { name: 'Apply', exact: true }).evaluate((button) => button.click());
      await page.waitForFunction(() => window.pendingSaves.length === 4);
      await page.evaluate(() => window.pendingSaves[3](true));
      await page.waitForFunction(() => document.querySelector('[aria-label="Draft save status"]').textContent === '');
      await context.close();
    });
  } finally {
    await browser?.close();
    server.kill();
  }
});

async function expectFocused(page, locator) {
  await page.waitForFunction((element) => document.activeElement === element, await locator.elementHandle());
}
