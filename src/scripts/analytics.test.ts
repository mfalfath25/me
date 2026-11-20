import { describe, expect, it } from 'vitest';

import { describeLink } from './analytics';

const ORIGIN = 'https://me.mfalfath25.workers.dev';

describe('describeLink', () => {
  it('normalizes internal links to path + query + hash', () => {
    expect(describeLink('/works/fffx?ref=home#top', '  FFFX \n project  ', ORIGIN, '/')).toEqual({
      href: '/works/fffx?ref=home#top',
      label: 'FFFX project',
      kind: 'internal',
      from: '/',
    });
  });

  it('marks external URLs as outbound', () => {
    expect(describeLink('https://github.com/mfalfath25', 'GitHub', ORIGIN, '/readme')).toEqual({
      href: 'https://github.com/mfalfath25',
      label: 'GitHub',
      kind: 'outbound',
      from: '/readme',
    });
  });

  it('classifies mailto and lightbox links', () => {
    expect(describeLink('mailto:mfalfath25@gmail.com', 'Email', ORIGIN, '/').kind).toBe('mailto');
    expect(describeLink('/_astro/photo.webp', 'Train pic', ORIGIN, '/archive', true)).toEqual({
      href: '/_astro/photo.webp',
      label: 'Train pic',
      kind: 'lightbox',
      from: '/archive',
    });
  });

  it('truncates long labels and falls back to href when empty', () => {
    const long = 'a'.repeat(120);
    expect(describeLink('/writing', long, ORIGIN, '/').label).toHaveLength(80);
    expect(describeLink('/writing', '   ', ORIGIN, '/').label).toBe('/writing');
  });
});
