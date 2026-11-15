/** Filenames cameras and phones generate; useless as alt text. */
const CAMERA_DEFAULT = /^(img|dsc|dscf|dscn|pxl|mvimg|gopr|dji|p|_mg|image|photo|screenshot)[-_ ]?\d*([-_ ]?\d+)*$/i;

export function isCameraDefaultName(name: string): boolean {
  return CAMERA_DEFAULT.test(name.trim());
}

/** "sunset-over-berlin_wall.jpg" → "Sunset over berlin wall" */
export function humanize(slugOrFilename: string): string {
  const base = slugOrFilename
    .split('/')
    .pop()!
    .replace(/\.[a-z0-9]+$/i, '');
  const words = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Alt text fallback chain: explicit alt → title → slug.
 * Camera-default names (IMG_4021) are skipped; returns '' if nothing usable is left.
 */
export function deriveAlt(input: { alt?: string | null; title?: string | null; slug: string }): string {
  for (const candidate of [input.alt, input.title]) {
    const value = candidate?.trim();
    if (value && !isCameraDefaultName(value)) return value;
  }
  return isCameraDefaultName(humanize(input.slug)) ? '' : humanize(input.slug);
}
