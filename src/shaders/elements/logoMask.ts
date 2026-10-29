// The official PNG is opaque: alpha alone would turn its entire square into water.
export function extractLogoInk(pixels: Uint8ClampedArray, width: number, height: number) {
  const data = new Uint8ClampedArray(pixels.length);
  let left = width, top = height, right = -1, bottom = -1;
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const [r, g, b, a] = pixels.subarray(offset, offset + 4);
    if (a < 128 || Math.min(r, g, b) < 210 || Math.max(r, g, b) - Math.min(r, g, b) > 35) continue;
    data.set([255, 255, 255, 255], offset);
    const x = index % width, y = Math.floor(index / width);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('The official logo has no readable white lettering.');
  return { data, left, top, width: right - left + 1, height: bottom - top + 1 };
}
