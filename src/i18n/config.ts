export const LOCALES = ['en', 'id'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_META: Record<Locale, { label: string; htmlLang: string; ogLocale: string }> = {
  en: { label: 'EN', htmlLang: 'en', ogLocale: 'en_US' },
  id: { label: 'ID', htmlLang: 'id', ogLocale: 'id_ID' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
