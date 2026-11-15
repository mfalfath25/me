import type { Locale } from './config';

/** Interface strings. Content itself is translated per item in the Studio. */
const strings = {
  en: {
    'nav.writing': 'Writing',
    'nav.archive': 'Archive',
    'nav.projects': 'Projects',
    'nav.about': 'About',
    skip: 'Skip to content',
    'home.latestWriting': 'Latest writing',
    'home.fromArchive': 'From the archive',
    'home.selectedProjects': 'Selected projects',
    'home.seeAll': 'See all',
    'writing.title': 'Writing',
    'writing.description': 'Essays, notes and longer thoughts.',
    'writing.series': 'Series',
    'writing.partOf': 'Part of the series',
    'archive.title': 'Archive',
    'archive.description': 'Photographs and things worth keeping.',
    'archive.albums': 'Albums',
    'archive.all': 'All',
    'archive.photos': 'Photos',
    'archive.links': 'Links',
    'projects.title': 'Projects',
    'projects.description': 'Things I have built and am building.',
    'projects.role': 'Role',
    'projects.period': 'Period',
    'projects.stack': 'Stack',
    'projects.status.active': 'Active',
    'projects.status.shipped': 'Shipped',
    'projects.status.archived': 'Archived',
    'tags.title': 'Tagged',
    'translation.unavailable': 'This page is not available in Indonesian yet, so it is shown in English.',
    draft: 'Draft / scheduled (only visible in dev)',
    published: 'Published',
    updated: 'Updated',
    'notFound.title': 'Page not found',
    'notFound.body': 'Nothing lives at this address.',
    'notFound.home': 'Go home',
  },
  id: {
    'nav.writing': 'Tulisan',
    'nav.archive': 'Arsip',
    'nav.projects': 'Proyek',
    'nav.about': 'Tentang',
    skip: 'Langsung ke konten',
    'home.latestWriting': 'Tulisan terbaru',
    'home.fromArchive': 'Dari arsip',
    'home.selectedProjects': 'Proyek pilihan',
    'home.seeAll': 'Lihat semua',
    'writing.title': 'Tulisan',
    'writing.description': 'Esai, catatan, dan pemikiran yang lebih panjang.',
    'writing.series': 'Seri',
    'writing.partOf': 'Bagian dari seri',
    'archive.title': 'Arsip',
    'archive.description': 'Foto dan hal-hal yang layak disimpan.',
    'archive.albums': 'Album',
    'archive.all': 'Semua',
    'archive.photos': 'Foto',
    'archive.links': 'Tautan',
    'projects.title': 'Proyek',
    'projects.description': 'Hal-hal yang sudah dan sedang saya bangun.',
    'projects.role': 'Peran',
    'projects.period': 'Periode',
    'projects.stack': 'Teknologi',
    'projects.status.active': 'Aktif',
    'projects.status.shipped': 'Rilis',
    'projects.status.archived': 'Diarsipkan',
    'tags.title': 'Tag',
    'translation.unavailable':
      'Halaman ini belum tersedia dalam bahasa Indonesia, jadi ditampilkan dalam bahasa Inggris.',
    draft: 'Draf / terjadwal (hanya terlihat saat dev)',
    published: 'Terbit',
    updated: 'Diperbarui',
    'notFound.title': 'Halaman tidak ditemukan',
    'notFound.body': 'Tidak ada apa-apa di alamat ini.',
    'notFound.home': 'Ke beranda',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type UiKey = keyof (typeof strings)['en'];

export function t(locale: Locale, key: UiKey): string {
  return strings[locale][key];
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}
