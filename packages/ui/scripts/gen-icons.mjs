import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');
const svg = readFileSync(join(pub, 'icon.svg'));

const sizes = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, pad: true },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon.png', size: 64 }
];

for (const s of sizes) {
  const pipeline = sharp(svg, { density: 512 }).resize(s.size, s.size, {
    fit: 'contain',
    background: s.pad ? { r: 0x13, g: 0x16, b: 0x1a, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 }
  });
  await pipeline.png().toFile(join(pub, s.file));
  console.log(`wrote ${s.file}`);
}
