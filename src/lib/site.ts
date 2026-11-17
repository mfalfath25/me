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
    sameAs: ['https://github.com/mfalfath25', 'https://www.instagram.com/mfajaralfath'],
  },
  description: {
    en: 'Food for thought, captured moments and works by Alfath',
    id: 'Bahan perenungan, momen-momen yang diabadikan, serta karya-karya dari Alfath',
  },
  socials: [
    { id: 'github', label: 'GitHub', href: 'https://github.com/mfalfath25' },
    { id: 'instagram', label: 'Instagram', href: 'https://www.instagram.com/mfajaralfath' },
  ] as const,
  /** Shown as an email icon in the colophon. */
  email: 'mfalfath25@gmail.com',
  /** Show the RSS icon in the colophon. Off: the feed (/rss.xml) still exists and is linked in the
   * page head, so feed readers find it. */
  rssIcon: false,
  /** Browser UI colour (theme-color), matching --color-paper in src/styles/tokens.css. */
  themeColor: { light: '#f9f1e2', dark: '#0b1511' },
  /** Show the EN / ID switch in the rail. Off until the Indonesian side has enough content; the /id routes still exist. */
  languageSwitch: false,
  /** Birds and rabbits in the bamboo (src/scripts/wildlife.ts). Off for now; `?weather=birds` or
   * `rabbits` still sends one to preview them. */
  wildlife: false,
  /** The small preset menu in the bottom right corner, for changing the photo cards' look
   * (src/scripts/presets.ts). The pick is kept per browser. */
  presetMenu: true,
  backdrop: 'bamboo' as Backdrop,
  cardHover: 'pop' as CardHover,
} as const;
