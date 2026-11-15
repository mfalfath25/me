import { describe, expect, it } from 'vitest';

import { deriveAlt, humanize, isCameraDefaultName } from './alt';

describe('humanize', () => {
  it('turns a slug or filename into a sentence', () => {
    expect(humanize('sunset-over-berlin_wall.jpg')).toBe('Sunset over berlin wall');
    expect(humanize('src/assets/archive/photos/rowboat-on-lake/image.jpg')).toBe('Image');
  });
});

describe('isCameraDefaultName', () => {
  it.each(['IMG_4021', 'DSC_0193', 'PXL_20240101_123456', 'DSCF1234', 'image', 'Screenshot 2024'])('flags %s', (name) =>
    expect(isCameraDefaultName(name)).toBe(true),
  );
  it.each(['Sunset over Berlin', 'image of a cat', 'imagine'])('accepts %s', (name) =>
    expect(isCameraDefaultName(name)).toBe(false),
  );
});

describe('deriveAlt', () => {
  it('prefers explicit alt, then title, then slug', () => {
    expect(deriveAlt({ alt: 'A boat', title: 'Lake', slug: 'lake' })).toBe('A boat');
    expect(deriveAlt({ alt: '', title: 'Lake at dawn', slug: 'lake' })).toBe('Lake at dawn');
    expect(deriveAlt({ title: null, slug: 'misty-valley' })).toBe('Misty valley');
  });
  it('skips camera defaults', () => {
    expect(deriveAlt({ alt: 'IMG_4021', title: 'DSC_0001', slug: 'img-4021' })).toBe('');
  });
});
