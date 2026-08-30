import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';

function request(port, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: requestPath }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
}

async function waitForServer(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await request(port, '/')).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Dev server did not start.');
}

test('dev server contains paths and survives malformed URLs', async () => {
  const port = 30_000 + (process.pid % 10_000);
  const sibling = path.join(process.cwd(), 'generated', 'dist-secret');
  await mkdir(sibling, { recursive: true });
  await writeFile(path.join(sibling, 'secret.txt'), 'not public');
  const server = spawn(process.execPath, ['scripts/dev-server.cjs', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  try {
    await waitForServer(port);
    assert.equal((await request(port, '/%2e%2e%2fdist-secret%2fsecret.txt')).status, 403);
    assert.equal((await request(port, '/%E0%A4%A')).status, 400);
    assert.equal((await request(port, '/')).status, 200);
  } finally {
    server.kill();
    await rm(sibling, { recursive: true, force: true });
  }
});
