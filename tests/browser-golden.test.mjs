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

async function downloadFrom(page, buttonName, directory) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const download = await downloadPromise;
  const target = path.join(directory, download.suggestedFilename());
  await download.saveAs(target);
  return readFile(target);
}

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
    const status = page.getByRole('status');
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
    const patternDraft = JSON.parse(await page.evaluate(() => localStorage.getItem('perler-beads-generator:draft')));
    assert.ok(patternDraft.layers.flatMap((layer) => layer.cells).filter(Boolean).every((cell) => cell.startsWith('mard-')));

    await page.getByRole('button', { name: '3D print', exact: true }).click();
    await page.waitForFunction(() => {
      const draft = JSON.parse(localStorage.getItem('perler-beads-generator:draft'));
      return draft.layers.every((layer) => layer.cells.every((cell) => cell === null || cell.startsWith('ams-')));
    });
    assert.equal(await page.getByRole('button', { name: 'Export 3MF', exact: true }).count(), 1);
    assert.equal(await page.getByLabel('Pattern color limit').count(), 0);
    assert.equal(await page.locator('.swatch').count(), 3);

    const beforeEdit = await page.evaluate(() => localStorage.getItem('perler-beads-generator:draft'));
    await page.locator('.swatch').nth(1).click();
    const canvas = page.locator('.workspace canvas');
    const box = await canvas.boundingBox();
    assert.ok(box);
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await page.waitForFunction(
      (before) => localStorage.getItem('perler-beads-generator:draft') !== before,
      beforeEdit,
    );

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

    await page.waitForTimeout(450);
    await canvas.focus();
    const coordinateBefore = await page.locator('.canvas-coordinate-status').textContent();
    await page.keyboard.press('ArrowRight');
    const coordinate = page.locator('.canvas-coordinate-status');
    const x = Number(await coordinate.getAttribute('data-x'));
    const y = Number(await coordinate.getAttribute('data-y'));
    const beforeKeyboardEdit = await page.evaluate(() => localStorage.getItem('perler-beads-generator:draft'));
    const draftBeforeKeyboard = JSON.parse(beforeKeyboardEdit);
    const activeLayer = draftBeforeKeyboard.layers.find((layer) => layer.id === draftBeforeKeyboard.activeLayerId);
    const differentSlot = draftBeforeKeyboard.amsColors.findIndex((color) => color.id !== activeLayer.cells[y * draftBeforeKeyboard.width + x]);
    await page.locator('.swatch').nth(differentSlot).click();
    await canvas.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (before) => localStorage.getItem('perler-beads-generator:draft') !== before,
      beforeKeyboardEdit,
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

    await page.getByLabel('Canvas width').fill('50');
    await page.getByLabel('Canvas height').fill('50');
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
    await page.addInitScript((draft) => {
      localStorage.clear();
      localStorage.setItem('perler-beads-generator:language', 'en');
      localStorage.setItem('perler-beads-generator:draft', draft);
    }, JSON.stringify(seed));
    await page.goto(url);
    await page.locator('.workspace canvas').waitFor();
    return { context, page };
  }

  async function savedCells(page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('perler-beads-generator:draft')).layers[0].cells);
  }

  async function waitForCells(page, cells) {
    await page.waitForFunction((expected) => {
      const draft = JSON.parse(localStorage.getItem('perler-beads-generator:draft'));
      return JSON.stringify(draft.layers[0].cells) === JSON.stringify(expected);
    }, cells);
  }

  async function setBrightness(page, value) {
    const before = await page.evaluate(() => localStorage.getItem('perler-beads-generator:draft'));
    await page.getByRole('tab', { name: 'Adjust', exact: true }).click();
    await page.getByLabel('Brightness').fill(String(value));
    await page.waitForFunction(
      (saved) => localStorage.getItem('perler-beads-generator:draft') !== saved,
      before,
    );
  }

  async function assertNextAdjustment(page, baseline) {
    const expected = adjustLayerCells(baseline, { ...defaultAdjustments, brightness: 2 }, completePalette);
    await setBrightness(page, 2);
    await waitForCells(page, expected);
    assert.deepEqual(await savedCells(page), expected);
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
      await page.waitForFunction(() => {
        const draft = JSON.parse(localStorage.getItem('perler-beads-generator:draft'));
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
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('perler-beads-generator:draft')).layers[0].cells[1] !== null);
      const afterPaint = await savedCells(page);
      await setBrightness(page, 2);
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
      await page.waitForFunction((before) => {
        const draft = JSON.parse(localStorage.getItem('perler-beads-generator:draft'));
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

async function expectFocused(page, locator) {
  await page.waitForFunction((element) => document.activeElement === element, await locator.elementHandle());
}
