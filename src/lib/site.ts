/** Site-wide identity. Used by SEO tags, JSON-LD, RSS and the footer. */
export const site = {
  name: 'Alfath',
  author: {
    name: 'Alfath',
    url: '/about',
    // Used in Person JSON-LD `sameAs`; helps search engines connect profiles.
    sameAs: ['https://github.com/mfalfath25'],
  },
  description: {
    en: 'Writing, photographs and projects by Alfath.',
    id: 'Tulisan, foto, dan proyek oleh Alfath.',
  },
  socials: [{ label: 'GitHub', href: 'https://github.com/mfalfath25' }],
  /** Accent color for browser UI (theme-color). Design pass will revisit. */
  themeColor: '#111111',
} as const;
