/**
 * The blocks of text that sit on a frosted patch over the backdrop. Keep in step with the
 * `:is(...)` lists under "Text over the backdrop" in src/styles/global.css.
 *
 * CSS frosts them with `backdrop-filter`, which the browser re-blurs on every composited frame.
 * The bamboo field frosts them in its own shader instead (bamboo-field.ts) and sets
 * `frost-in-field` on <html>, which switches the CSS patches off.
 */
export const FROST_SELECTOR = [
  '.page-head > *',
  '.section__head > *',
  '.row__date',
  '.row__body',
  '.prose',
  '.article__head',
  '.article__foot',
  '.work__text',
  '.links__body',
  '.shot__caption',
  '.notice',
  '.inline-list',
  '.signature-link',
  '.rail__link',
  // The rail's foot, item by item, so each patch hugs its item rather than the whole column.
  '.autograph',
  '.tswitch',
  '.colophon ul',
  '.colophon p',
].join(', ');

/** Class on <html> while a backdrop frosts the text itself. */
export const FROST_IN_FIELD = 'frost-in-field';
