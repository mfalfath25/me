import { component, defineMarkdocConfig, nodes } from '@astrojs/markdoc/config';

export default defineMarkdocConfig({
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
          matches: ['post', 'project', 'photo', 'link', 'album', 'tag', 'series'],
        },
        slug: { type: String, required: true },
        label: { type: String },
      },
    },
  },
});
