import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

function assertZip(buffer, entries) {
  assert.deepEqual([...buffer.subarray(0, 2)], [0x50, 0x4b]);
  const text = buffer.toString('latin1');
  entries.forEach((entry) => assert.ok(text.includes(entry), `missing ZIP entry ${entry}`));
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
    assertZip(threeMf, ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']);

    const xlsx = await downloadFrom(page, 'Export usage', directory);
    assertZip(xlsx, ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);

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
