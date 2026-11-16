/**
 * The animated layer behind every page. `bamboo`: dithered bamboo that bends in the wind and in
 * gusts from the pointer (BambooField.astro). Set aside but kept working, switch back here:
 * `koi`, the koi pond in ASCII (KoiPond.astro); `flame`, the dithered fire with rising sparks
 * (FlameField.astro).
 */
export type Backdrop = 'bamboo' | 'koi' | 'flame';

/**
 * How a photo card answers a hovering pointer; in both the braille gives way to the photo. `pop`:
 * it springs up a little. Set aside but kept working: `foil`, the card lifts and tilts toward the
 * cursor under a glare and a holographic sheen.
 */
export type CardHover = 'pop' | 'foil';

/** Site-wide identity. Used by SEO tags, JSON-LD, RSS and the footer. */
export const site = {
  name: 'Alfath',
  author: {
    name: 'Alfath',
    url: '/readme',
    // Used in Person JSON-LD `sameAs`; helps search engines connect profiles.
    sameAs: ['https://github.com/mfalfath25'],
  },
  description: {
    en: 'Writing, photographs and works by Alfath.',
    id: 'Tulisan, foto, dan karya oleh Alfath.',
  },
  socials: [{ label: 'GitHub', href: 'https://github.com/mfalfath25' }],
  /** Browser UI colour (theme-color), matching --color-paper in src/styles/tokens.css. */
  themeColor: { light: '#f9f1e2', dark: '#0b1511' },
  backdrop: 'bamboo' as Backdrop,
  cardHover: 'pop' as CardHover,
} as const;
