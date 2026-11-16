import { getEntry, render } from 'astro:content';

import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

import type { Page } from './types';

export async function getReadmePage(locale: Locale): Promise<Page & { isFallback: boolean }> {
  const entry = (await getEntry('pages', `readme-${locale}`)) ?? (await getEntry('pages', `readme-${DEFAULT_LOCALE}`));
  if (!entry) throw new Error('Missing Readme page. Create it in the Studio under Site → Readme.');
  const shown = entry.id.endsWith(`-${locale}`) ? locale : DEFAULT_LOCALE;
  return {
    locale: shown,
    isFallback: shown !== locale,
    title: entry.data.title,
    description: entry.data.description,
    render: () => render(entry),
  };
}
