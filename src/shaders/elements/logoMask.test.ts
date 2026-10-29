import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractLogoInk } from './logoMask';

test('opaque cyan, blue, halftone and black pixels do not become a rectangular water logo', () => {
  const pixels = new Uint8ClampedArray([
    49, 199, 213, 255, 20, 70, 150, 255, 160, 170, 180, 255,
    0, 0, 0, 255, 255, 255, 255, 255, 245, 244, 240, 255,
  ]);
  const mask = extractLogoInk(pixels, 3, 2);
  assert.deepEqual([mask.left, mask.top, mask.width, mask.height], [1, 1, 2, 1]);
  assert.deepEqual(Array.from(mask.data).filter((_, index) => index % 4 === 3), [0, 0, 0, 0, 255, 255]);
});

test('transparent white and an empty mark fall back instead of creating invalid particle positions', () => {
  assert.throws(() => extractLogoInk(new Uint8ClampedArray([255, 255, 255, 0]), 1, 1), /no readable white/);
});
