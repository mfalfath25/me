#!/usr/bin/env node
/**
 * Stage 1 of the image pipeline (see docs/image-pipeline.md). Idempotent; safe to run any time.
 *
 * 1. For every Photo without camera details, read EXIF from the file into its YAML entry.
 * 2. For every image in src/assets: auto-rotate, cap the long edge at 2560px, re-encode at
 *    quality 90 and strip ALL metadata (GPS included). Images already normalized are skipped.
 *
 * Usage: pnpm images:normalize [--check]   (--check exits 1 if anything would change)
 */
import { rename, stat } from 'node:fs/promises';
import { extname } from 'node:path';

import exifr from 'exifr';
import sharp from 'sharp';

import { ASSETS_DIR, listFiles, loadYaml, PHOTOS_DIR, rel, resolveFrom, saveYaml } from './lib/content-files.mjs';

const MAX_EDGE = 2560;
const QUALITY = 90;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);
const CHECK = process.argv.includes('--check');

const changed = [];

// ── 1. EXIF → YAML (must run before stripping) ─────────────────────────
const fmt = {
  focalLength: (v) => (v ? `${Math.round(v)}mm` : null),
  aperture: (v) => (v ? `ƒ/${Number(v).toFixed(1).replace(/\.0$/, '')}` : null),
  shutter: (v) => (v ? (v >= 1 ? `${v}s` : `1/${Math.round(1 / v)}s`) : null),
  iso: (v) => (v ? String(v) : null),
};

for (const file of await listFiles(PHOTOS_DIR, (f) => f.endsWith('.yaml'))) {
  const { doc, data } = await loadYaml(file);
  if (!data.image || (data.exif && Object.values(data.exif).some(Boolean))) continue;

  const imagePath = resolveFrom(file, data.image);
  let tags;
  try {
    tags = await exifr.parse(imagePath, [
      'Make',
      'Model',
      'LensModel',
      'FocalLength',
      'FNumber',
      'ExposureTime',
      'ISO',
      'DateTimeOriginal',
    ]);
  } catch {
    tags = undefined;
  }
  if (!tags) continue;

  const camera =
    [tags.Make, tags.Model]
      .filter(Boolean)
      .join(' ')
      .replace(/^(\w+) \1 /i, '$1 ') || null;
  const exif = {
    camera,
    lens: tags.LensModel ?? null,
    focalLength: fmt.focalLength(tags.FocalLength),
    aperture: fmt.aperture(tags.FNumber),
    shutter: fmt.shutter(tags.ExposureTime),
    iso: fmt.iso(tags.ISO),
  };
  if (!Object.values(exif).some(Boolean)) continue;

  doc.set('exif', exif);
  if (!data.takenAt && tags.DateTimeOriginal instanceof Date) {
    doc.set('takenAt', tags.DateTimeOriginal.toISOString().slice(0, 10));
  }
  changed.push(`${rel(file)} (camera details)`);
  if (!CHECK) await saveYaml(file, doc);
}

// ── 2. Resize + strip metadata ──────────────────────────────────────────
for (const file of await listFiles(ASSETS_DIR, (f) => IMAGE_EXT.has(extname(f).toLowerCase()))) {
  const meta = await sharp(file).metadata();
  const tooBig = Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE;
  const hasMetadata = Boolean(meta.exif || meta.xmp || meta.iptc);
  const rotated = (meta.orientation ?? 1) !== 1;
  if (!tooBig && !hasMetadata && !rotated) continue;

  changed.push(
    `${rel(file)} (${[tooBig && 'resized', hasMetadata && 'metadata stripped', rotated && 'rotated'].filter(Boolean).join(', ')})`,
  );
  if (CHECK) continue;

  const before = (await stat(file)).size;
  let pipeline = sharp(file)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  // Convert to sRGB and drop everything else (EXIF, GPS, XMP, IPTC).
  pipeline = pipeline.toColourspace('srgb');
  const ext = extname(file).toLowerCase();
  if (ext === '.png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (ext === '.webp') pipeline = pipeline.webp({ quality: QUALITY });
  else pipeline = pipeline.jpeg({ quality: QUALITY, mozjpeg: true });

  const tmp = `${file}.tmp`;
  await pipeline.toFile(tmp);
  await rename(tmp, file);
  const after = (await stat(file)).size;
  console.log(`  ${rel(file)}: ${(before / 1024).toFixed(0)}kB → ${(after / 1024).toFixed(0)}kB`);
}

if (changed.length === 0) {
  console.log('Images already normalized.');
} else {
  console.log(
    `${CHECK ? 'Would change' : 'Changed'} ${changed.length} file(s):\n${changed.map((c) => `  - ${c}`).join('\n')}`,
  );
  if (CHECK) process.exit(1);
}
