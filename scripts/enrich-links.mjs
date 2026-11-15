#!/usr/bin/env node
/**
 * Fills in Link previews (see docs/content-model.md → Link). Idempotent.
 *
 * For every Link whose `meta.fetchedAt` is empty: fetch the page, read its title, description,
 * site name and preview image, save the image locally (so it can never break), and write it all
 * back into the YAML entry. Failures are logged and retried on the next run.
 *
 * Usage: pnpm links:enrich
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { ASSETS_DIR, LINKS_DIR, listFiles, loadYaml, rel, saveYaml } from './lib/content-files.mjs';

const UA = 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)';
const TIMEOUT_MS = 10_000;

const decode = (s) =>
  s
    ?.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim() || null;

function readMeta(html, ...keys) {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, 'i'),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decode(m[1]);
    }
  }
  return null;
}

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, {
    ...init,
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': UA, ...init.headers },
  });
}

let updated = 0;
for (const file of await listFiles(LINKS_DIR, (f) => f.endsWith('.yaml'))) {
  const { doc, data } = await loadYaml(file);
  if (!data.url || data.meta?.fetchedAt) continue;
  const slug = file
    .split('/')
    .pop()
    .replace(/\.yaml$/, '');

  try {
    const res = await fetchWithTimeout(data.url, { headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = (await res.text()).slice(0, 500_000);
    const pageTitle =
      readMeta(html, 'og:title', 'twitter:title') ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]);
    const meta = {
      siteName: readMeta(html, 'og:site_name', 'application-name') ?? new URL(res.url).hostname.replace(/^www\./, ''),
      description: readMeta(html, 'og:description', 'twitter:description', 'description'),
      image: null,
      fetchedAt: new Date().toISOString(),
    };

    const imageUrl = readMeta(html, 'og:image', 'og:image:url', 'twitter:image');
    if (imageUrl) {
      try {
        const imgRes = await fetchWithTimeout(new URL(imageUrl, res.url));
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const dir = join(ASSETS_DIR, 'archive/links', slug);
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, 'image.jpg'),
          await sharp(buffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer(),
        );
        meta.image = `../../../assets/archive/links/${slug}/image.jpg`;
      } catch (err) {
        console.warn(`  ${slug}: preview image skipped (${err.message})`);
      }
    }

    if (!data.title || data.title === data.url) doc.set('title', pageTitle ?? data.url);
    doc.set('meta', meta);
    // Quote the timestamp so YAML keeps it a string, not a Date.
    doc.getIn(['meta', 'fetchedAt'], true).type = 'QUOTE_DOUBLE';
    await saveYaml(file, doc);
    updated++;
    console.log(`  ${rel(file)}: ${meta.siteName}${meta.image ? ' + image' : ''}`);
  } catch (err) {
    console.warn(`  ${rel(file)}: fetch failed (${err.message}); will retry next run`);
  }
}

console.log(updated ? `Enriched ${updated} link(s).` : 'Links already enriched.');
