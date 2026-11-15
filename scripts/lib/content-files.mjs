// Shared helpers for content pipeline scripts (run by GitHub Actions and locally).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const ASSETS_DIR = join(ROOT, 'src/assets');
export const PHOTOS_DIR = join(ROOT, 'src/content/archive/photos');
export const LINKS_DIR = join(ROOT, 'src/content/archive/links');

export async function listFiles(dir, predicate = () => true) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, predicate)));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

/** Load a YAML entry keeping key order and comments, so diffs stay small. */
export async function loadYaml(file) {
  const doc = parseDocument(await readFile(file, 'utf8'));
  return { doc, data: doc.toJS() ?? {} };
}

export async function saveYaml(file, doc) {
  await writeFile(file, doc.toString({ lineWidth: 0 }));
}

/** Resolve an image path stored in a content file (relative to that file). */
export function resolveFrom(contentFile, relativePath) {
  return resolve(dirname(contentFile), relativePath);
}

export const rel = (file) => file.replace(`${ROOT}/`, '');
