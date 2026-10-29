import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createServer } from 'vite';

test('the loader has visible, embedded official lettering before any effects or image requests', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { WaterLogo } = await server.ssrLoadModule('/src/shaders/elements/WaterLogo.tsx');
    const html = renderToStaticMarkup(createElement(WaterLogo));
    const image = html.match(/<img[^>]*src="(data:image\/png;base64,[^"]+)"/);
    assert.ok(image, 'The initial loader render must include its mask without a network request');
    const png = Buffer.from(image[1].split(',')[1], 'base64');
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
    assert.equal(png[25], 6, 'The mask needs an alpha channel rather than an opaque square');
    assert.ok(!html.includes('Untitled_Design'));
    assert.ok(!html.includes('invisible'));
  } finally { await server.close(); }
});

test('the shared display logo stays under 64 KB and is preloaded by the HTML document', async () => {
  const logo = await readFile(new URL('../../../public/assets/brand/machan-logo.webp', import.meta.url));
  assert.equal(logo.toString('ascii', 0, 4), 'RIFF');
  assert.equal(logo.toString('ascii', 8, 12), 'WEBP');
  assert.ok(logo.length < 64 * 1024, 'Avoid shipping the original 1.78 MB PNG again');
  const html = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link\b[^>]*rel="preload"[^>]*as="image"[^>]*href="\/assets\/brand\/machan-logo.webp"/);
});
