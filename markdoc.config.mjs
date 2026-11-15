import { component, defineMarkdocConfig, nodes } from '@astrojs/markdoc/config';
import shiki from '@astrojs/markdoc/shiki';
import { createCssVariablesTheme } from 'shiki';

export default defineMarkdocConfig({
  // Code fences are highlighted at build time (no client JS). The theme only names CSS variables,
  // so every colour is a --shiki-* token in src/styles/tokens.css and follows the light/dark theme.
  extends: [
    shiki({
      theme: createCssVariablesTheme({ name: 'tokens', variablePrefix: '--shiki-', fontStyle: true }),
      wrap: false,
    }),
  ],
  nodes: {
    image: {
      ...nodes.image,
      render: component('./src/components/markdoc/MarkdocImage.astro'),
    },
  },
  tags: {
    // Internal cross-reference: {% ref kind="post" slug="hello-world" label="optional text" /%}
    // Resolved at build time; a broken reference fails the build.
    ref: {
      render: component('./src/components/markdoc/Ref.astro'),
      selfClosing: true,
      attributes: {
        kind: {
          type: String,
          required: true,
          matches: ['post', 'work', 'photo', 'link', 'album', 'tag', 'series'],
        },
        slug: { type: String, required: true },
        label: { type: String },
      },
    },
  },
});
