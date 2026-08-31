/**
 * Draws the PWA install icons that `public/manifest.webmanifest` declares.
 *
 * The Aqua placeholder mark is a flat teal disc, so it can be rendered at any
 * size from the geometry rather than resampled — upscaling the 192px file to
 * 512 would ship a soft, obviously-stretched icon on the one surface (the
 * Android home screen and the install dialog) where the icon is largest.
 *
 * Two shapes come out of here:
 *
 *   any       — the disc on transparency, matching the existing 32/180/192
 *               files, for surfaces that render the icon as authored.
 *   maskable  — the disc on an OPAQUE background (#0e1013, the manifest's own
 *               theme colour) with the mark inside the central 80% safe zone.
 *               A maskable icon is cropped to whatever shape the platform
 *               likes; a transparent, edge-to-edge disc declared `maskable`
 *               gets its rim sliced off and shows the launcher's wallpaper
 *               through the corners, which is what the 192 file was doing.
 *
 * Run: node scripts/generate-pwa-icons.mjs
 * It rewrites only the files it names below; the hand-supplied 32/180/192
 * favicons are left exactly as they are.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** The mark, sampled straight out of the existing favicon-default-192.png. */
const MARK = { r: 14, g: 165, b: 164 };
/** `background_color`/`theme_color` from the manifest. */
const BACKDROP = { r: 14, g: 16, b: 19 };

/** The existing 192 disc spans 190 of 192 pixels — keep that proportion. */
const ANY_DIAMETER = 190 / 192;
/**
 * Maskable safe zone: platforms may crop everything outside a centred circle
 * of 80% diameter. 0.76 keeps the whole mark inside it with a margin rather
 * than resting on the boundary.
 */
const MASKABLE_DIAMETER = 0.76;

/** Anti-aliasing: sample each pixel on a 4x4 grid and average the coverage. */
const SAMPLES = 4;

function discCoverage(x, y, centre, radius) {
  let inside = 0;
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const px = x + (sx + 0.5) / SAMPLES - centre;
      const py = y + (sy + 0.5) / SAMPLES - centre;
      if (px * px + py * py <= radius * radius) inside++;
    }
  }
  return inside / (SAMPLES * SAMPLES);
}

/**
 * @param {number} size
 * @param {{ diameter: number, backdrop?: { r: number, g: number, b: number } }} shape
 * @returns {Buffer} raw RGBA rows
 */
function drawDisc(size, { diameter, backdrop }) {
  const pixels = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const radius = (size * diameter) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const coverage = discCoverage(x, y, centre, radius);
      const at = (y * size + x) * 4;
      if (backdrop) {
        // Opaque throughout: the mark is composited onto the backdrop so the
        // crop can never expose transparency.
        pixels[at] = Math.round(backdrop.r + (MARK.r - backdrop.r) * coverage);
        pixels[at + 1] = Math.round(backdrop.g + (MARK.g - backdrop.g) * coverage);
        pixels[at + 2] = Math.round(backdrop.b + (MARK.b - backdrop.b) * coverage);
        pixels[at + 3] = 255;
      } else {
        pixels[at] = MARK.r;
        pixels[at + 1] = MARK.g;
        pixels[at + 2] = MARK.b;
        pixels[at + 3] = Math.round(255 * coverage);
      }
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}

/** Minimal 8-bit RGBA, non-interlaced PNG — no dependency, and it is all we need. */
function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const OUTPUTS = [
  { file: "favicon-default-512.png", size: 512, shape: { diameter: ANY_DIAMETER } },
  { file: "favicon-default-maskable-512.png", size: 512, shape: { diameter: MASKABLE_DIAMETER, backdrop: BACKDROP } },
  { file: "favicon-default-maskable-192.png", size: 192, shape: { diameter: MASKABLE_DIAMETER, backdrop: BACKDROP } },
];

for (const { file, size, shape } of OUTPUTS) {
  const png = encodePng(size, drawDisc(size, shape));
  writeFileSync(join(publicDir, file), png);
  console.log(`${file} — ${size}x${size}, ${png.length} bytes`);
}
