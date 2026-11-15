import { getEntry, render } from 'astro:content';

import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

import type { Page } from './types';

export async function getAboutPage(locale: Locale): Promise<Page & { isFallback: boolean }> {
  const entry = (await getEntry('pages', `about-${locale}`)) ?? (await getEntry('pages', `about-${DEFAULT_LOCALE}`));
  if (!entry) throw new Error('Missing About page. Create it in the Studio under Site → About.');
  const shown = entry.id.endsWith(`-${locale}`) ? locale : DEFAULT_LOCALE;
  return {
    locale: shown,
    isFallback: shown !== locale,
    title: entry.data.title,
    description: entry.data.description,
    render: () => render(entry),
  };
}
