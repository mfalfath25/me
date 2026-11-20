/**
 * Dither Presets: the looks a photo card can take at rest. `site` is the house braille in the
 * theme's own ramp. The rest are copied from the Devault ASCII generator's presets
 * (devault-ascii.pages.dev), keeping what holds up on a still card: the glyph style, the colour
 * mode and palette, the background, contrast, invert, cutoff, detail and the overlay settings.
 * The generator's screen effects (bloom, scanlines, curvature, vignette, grain, flicker,
 * animation) are left out. Its moving styles (film, drift, particle) are drawn as still
 * approximations.
 *
 * The Owner picks one in the preset menu (PresetMenu.astro). The pick is kept in this browser
 * only, under STORAGE_KEY.
 */

/** How a cell is drawn. */
export type PresetKind = 'braille' | 'ramp' | 'dots' | 'dither' | 'lego' | 'tiles';

export type PresetColour =
  /** The theme's --color-dither-* ramp (the house look). */
  | { mode: 'theme' }
  /** One ink for every glyph. */
  | { mode: 'mono'; color: string }
  /** Four stops, shadow to highlight, picked by the brightness under the glyph. */
  | { mode: 'palette'; stops: string[] }
  /** The photo's own colour under the glyph, saturated by `boost` (0 to 100). */
  | { mode: 'source'; boost: number; tint?: string };

export interface Preset {
  id: string;
  label: string;
  kind: PresetKind;
  /** Glyphs, densest first (ramp and tiles). */
  ramp: string;
  colour: PresetColour;
  /** Card background: `theme` is the paper token, otherwise any CSS colour. */
  paper: 'theme' | string;
  /** -100 to 100. */
  contrast: number;
  invert: boolean;
  /** Brightness (0 to 100) under which a cell is left blank. */
  cutoff: number;
  /** Columns across a 130-column reference: more is finer. */
  cols: number;
  /** Width over height of one cell (ramp glyphs are about half as wide as tall). */
  aspect: number;
  /** 0 to 100: share of cells nudged off their grid spot. */
  scatter: number;
  /** Glyphs laid over the photo instead of on a background. */
  overlay: null | { opacity: number; fade: number; blend: GlobalCompositeOperation };
}

export const STORAGE_KEY = 'dither-preset';
export const PRESET_EVENT = 'presetchange';

const BG = { dark: '#0D0D12', black: '#000000', paper: '#F2EFE8' } as const;

const PALETTES: Record<string, string[]> = {
  devault: ['#4A40AD', '#8A81F2', '#D0BCF7', '#F4F1FD'],
  phosphor: ['#0F7A35', '#2BD95B', '#9DFFB8', '#E2FFEB'],
  amber: ['#8A4300', '#FF9F1A', '#FFD27A', '#FFF1D2'],
  ice: ['#1E4FD8', '#38B6FF', '#A8E6FF', '#F0FBFF'],
};

const RAMPS = {
  classic: '@%#*+=-:. ',
  detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
  binary: '10 ',
  tiles: '@#8XS%t;:',
  drift: '▚▞▖∙· ',
} as const;

/** The generator's base settings, before a preset's own. */
const BASE: Preset = {
  id: 'mono',
  label: 'Mono',
  kind: 'ramp',
  ramp: RAMPS.classic,
  colour: { mode: 'mono', color: '#F4F4F7' },
  paper: BG.dark,
  contrast: 0,
  invert: false,
  cutoff: 6,
  cols: 130,
  aspect: 0.5,
  scatter: 0,
  overlay: null,
};

const make = (id: string, label: string, patch: Partial<Preset>): Preset => ({ ...BASE, ...patch, id, label });
const palette = (name: keyof typeof PALETTES): PresetColour => ({ mode: 'palette', stops: PALETTES[name] });
const source = (boost: number): PresetColour => ({ mode: 'source', boost });
const white: PresetColour = { mode: 'mono', color: '#FFFFFF' };

export const DEFAULT_PRESET = 'site';

export const PRESETS: Preset[] = [
  make('site', 'Site braille', { kind: 'braille', colour: { mode: 'theme' }, paper: 'theme', cutoff: 0 }),
  make('devault', 'Devault', { colour: palette('devault') }),
  make('mono', 'Mono', {}),
  make('terminal', 'Old monitor', { colour: palette('phosphor'), paper: BG.black }),
  make('amber', 'Amber glow', {
    ramp: RAMPS.detailed,
    colour: palette('amber'),
    paper: BG.black,
    cols: 150,
  }),
  make('matrix', 'Digital rain', {
    ramp: RAMPS.binary,
    colour: palette('phosphor'),
    paper: BG.black,
    contrast: 25,
  }),
  make('newsprint', 'Printed page', {
    ramp: RAMPS.detailed,
    colour: { mode: 'mono', color: '#14141A' },
    paper: BG.paper,
    contrast: 20,
    cols: 150,
  }),
  make('braille', 'Braille', { kind: 'braille', colour: palette('ice'), cols: 110 }),
  make('halftone', 'Halftone', { kind: 'dots', paper: BG.black, contrast: 20, cols: 90, aspect: 1 }),
  make('colour', 'True colour', { ramp: RAMPS.detailed, colour: source(35), cols: 150 }),
  make('bricks', 'Brick mosaic', { kind: 'lego', colour: source(45), contrast: 12, cols: 64, aspect: 1 }),
  make('tiles', 'Letter tiles', {
    kind: 'tiles',
    ramp: RAMPS.tiles,
    colour: source(30),
    paper: '#FAFAF9',
    cutoff: 10,
    contrast: 14,
    cols: 110,
    aspect: 0.69,
  }),
  make('film', 'Film', {
    ramp: RAMPS.detailed,
    colour: { mode: 'source', boost: 10, tint: '#FFB866' },
    paper: BG.black,
  }),
  make('drift', 'Drift', { ramp: RAMPS.drift, colour: source(25), paper: BG.black, cols: 170, aspect: 0.6 }),
  make('particle', 'Particle', { kind: 'dots', colour: source(25), paper: BG.black, cutoff: 20, aspect: 1 }),
  make('tiles-grey', 'Grey tiles', {
    kind: 'tiles',
    ramp: RAMPS.tiles,
    paper: '#FAFAF9',
    colour: { mode: 'mono', color: '#3A3A44' },
    contrast: 12,
    cutoff: 12,
    cols: 110,
    aspect: 0.69,
  }),
  make('ascii-gradient', 'ASCII gradient', {
    ramp: ' .xXSO0#@'.split('').reverse().join(''),
    colour: white,
    scatter: 60,
    cols: 125,
    aspect: 0.62,
    cutoff: 10,
    overlay: { opacity: 0.55, fade: 0.7, blend: 'source-over' },
  }),
  make('binary-gradient', 'Binary gradient', {
    ramp: ' .o0018'.split('').reverse().join(''),
    colour: white,
    scatter: 30,
    cols: 165,
    aspect: 0.68,
    cutoff: 8,
    overlay: { opacity: 0.72, fade: 0.65, blend: 'source-over' },
  }),
  make('dither-gradient', 'Dither gradient', {
    kind: 'dither',
    colour: white,
    cols: 240,
    cutoff: 0,
    contrast: 10,
    aspect: 1,
    overlay: { opacity: 0.45, fade: 0.4, blend: 'soft-light' },
  }),
  make('halftone-gradient', 'Halftone gradient', {
    kind: 'dots',
    colour: { mode: 'mono', color: '#000000' },
    invert: true,
    cols: 110,
    cutoff: 4,
    aspect: 1,
    overlay: { opacity: 0.45, fade: 0, blend: 'multiply' },
  }),
];

export function findPreset(id: string | null | undefined): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** The preset picked in this browser, or the house braille. */
export function storedPreset(): Preset {
  try {
    return findPreset(localStorage.getItem(STORAGE_KEY));
  } catch {
    return PRESETS[0];
  }
}

export function storePreset(id: string) {
  try {
    if (id === DEFAULT_PRESET) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage blocked: the pick lasts for this page only */
  }
  document.dispatchEvent(new CustomEvent(PRESET_EVENT, { detail: id }));
}

const rampCache = new Map<string, string[]>();

/** The glyph for a brightness of `ink` (0 none to 1 full) on a densest-first ramp. */
export function glyphFor(ramp: string, ink: number): string {
  let chars = rampCache.get(ramp);
  if (!chars) {
    chars = Array.from(ramp);
    rampCache.set(ramp, chars);
  }
  const i = Math.round((1 - Math.min(1, Math.max(0, ink))) * (chars.length - 1));
  return chars[i] ?? ' ';
}

/** Applies contrast (-100 to 100) about the midpoint, clamped to 0..1. */
export function applyContrast(v: number, contrast: number): number {
  const k = 1 + contrast / 100;
  return Math.min(1, Math.max(0, (v - 0.5) * k + 0.5));
}
