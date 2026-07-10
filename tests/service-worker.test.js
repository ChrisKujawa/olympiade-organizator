import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('service worker precaches every first-party app module needed offline', async () => {
  const serviceWorker = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');

  for (const file of ['./index.html', './styles.css', './app.js', './scheduler.js', './state.js', './manifest.webmanifest', './icon.svg']) {
    assert.match(serviceWorker, new RegExp(`['"]${escapeRegExp(file)}['"]`));
  }
});

test('service worker cache version is bumped for current app shell', async () => {
  const serviceWorker = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');

  assert.match(serviceWorker, /olympiade-organizator-v13/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
