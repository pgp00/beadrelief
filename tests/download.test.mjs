import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadBlob } from '../generated/dist/src/download.js';

test('downloads are attached, removed, and revoked after the click', async (t) => {
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const events = [];
  const link = {
    href: '',
    download: '',
    click: () => events.push('click'),
    remove: () => events.push('remove'),
  };
  globalThis.document = { body: { appendChild: () => events.push('append') }, createElement: () => link };
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => events.push('revoke');
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  downloadBlob('project.3mf', new Uint8Array([1]), 'model/3mf');
  assert.equal(link.download, 'project.3mf');
  assert.deepEqual(events, ['append', 'click', 'remove']);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, ['append', 'click', 'remove', 'revoke']);
});
