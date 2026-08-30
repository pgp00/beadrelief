import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import test from 'node:test';
import { chromium } from 'playwright-core';

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

function readZipEntries(archive) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const entries = [];
  let offset = 0;

  while (offset + 4 <= archive.length && view.getUint32(offset, true) === 0x04034b50) {
    assert.ok(offset + 30 <= archive.length, 'truncated ZIP local header');
    const method = view.getUint16(offset + 8, true);
    assert.ok(method === 0 || method === 8, `unsupported ZIP method ${method}`);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    assert.ok(dataEnd <= archive.length, 'truncated ZIP entry');
    const name = new TextDecoder().decode(archive.subarray(nameStart, nameStart + nameLength));
    const data = method === 8
      ? inflateRawSync(archive.subarray(dataStart, dataEnd))
      : archive.subarray(dataStart, dataEnd);
    assert.equal(data.byteLength, uncompressedSize, `size mismatch for ZIP entry ${name}`);
    entries.push({ name, data, method, compressedSize, localOffset: offset });
    offset = dataEnd;
  }

  assert.ok(offset + 4 <= archive.length, 'missing ZIP central directory');
  const centralDirectoryOffset = offset;
  for (const entry of entries) {
    assert.ok(offset + 46 <= archive.length, 'truncated ZIP central directory');
    assert.equal(view.getUint32(offset, true), 0x02014b50, 'invalid ZIP central-directory signature');
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const name = new TextDecoder().decode(archive.subarray(nameStart, nameStart + nameLength));
    assert.equal(name, entry.name);
    assert.equal(view.getUint16(offset + 10, true), entry.method);
    assert.equal(compressedSize, entry.compressedSize);
    assert.equal(uncompressedSize, entry.data.byteLength);
    assert.equal(view.getUint32(offset + 42, true), entry.localOffset);
    offset = nameStart + nameLength + extraLength + commentLength;
  }

  assert.ok(offset + 22 <= archive.length, 'missing ZIP end-of-central-directory record');
  assert.equal(view.getUint32(offset, true), 0x06054b50, 'invalid ZIP EOCD signature');
  assert.equal(view.getUint16(offset + 8, true), entries.length);
  assert.equal(view.getUint16(offset + 10, true), entries.length);
  assert.equal(view.getUint32(offset + 12, true), offset - centralDirectoryOffset);
  assert.equal(view.getUint32(offset + 16, true), centralDirectoryOffset);
  assert.equal(offset + 22 + view.getUint16(offset + 20, true), archive.length);
  return entries;
}

function zipEntry(entries, name) {
  const entry = entries.find((candidate) => candidate.name === name);
  assert.ok(entry, `missing ZIP entry ${name}`);
  return entry.data;
}

async function assertExportedXml(page, threeMfEntries, xlsxEntries) {
  const modelXml = new TextDecoder().decode(zipEntry(threeMfEntries, '3D/3dmodel.model'));
  const workbookXml = new TextDecoder().decode(zipEntry(xlsxEntries, 'xl/workbook.xml'));
  const workbookRelsXml = new TextDecoder().decode(zipEntry(xlsxEntries, 'xl/_rels/workbook.xml.rels'));
  const worksheetXml = xlsxEntries
    .filter(({ name }) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .map(({ data }) => new TextDecoder().decode(data));
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
    await page.getByRole('button', { name: 'Bead pattern', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Bead pattern', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Export 3MF', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Pattern color limit').inputValue(), '24');
    assert.equal(await page.getByLabel('Pattern color limit').getAttribute('max'), '291');
    assert.equal(await page.getByLabel('Canvas width').getAttribute('max'), '180');
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
    assert.ok(patternDraft.layers.some((layer) => layer.cells.some((cell) => cell && !cell.startsWith('ams-'))));

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
    assert.deepEqual(threeMfEntries.map(({ name }) => name), [
      '[Content_Types].xml',
      '_rels/.rels',
      '3D/3dmodel.model',
      'Metadata/project_settings.config',
      'Metadata/model_settings.config',
      'Metadata/beadrelief_recipe.config',
    ]);

    const xlsx = await downloadFrom(page, 'Export usage', directory);
    const xlsxEntries = readZipEntries(xlsx);
    for (const name of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
    ]) zipEntry(xlsxEntries, name);
    assert.ok(xlsxEntries.some(({ name }) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)));
    await assertExportedXml(page, threeMfEntries, xlsxEntries);

    await page.getByRole('button', { name: 'Export pattern', exact: true }).click();
    await page.locator('.export-format-select').first().selectOption('png');
    const png = await downloadFrom(page, 'Export PNG', directory);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

    await page.getByRole('button', { name: 'Export pattern', exact: true }).click();
    await page.locator('.export-format-select').first().selectOption('pdf');
    const pdf = await downloadFrom(page, 'Export PDF', directory);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');

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
    assert.ok(editLongTasks.every((duration) => duration <= 50), `edit long tasks: ${editLongTasks.join(', ')}`);
    assert.deepEqual(browserErrors, []);
  } finally {
    await browser?.close();
    server.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

async function expectFocused(page, locator) {
  await page.waitForFunction((element) => document.activeElement === element, await locator.elementHandle());
}
