/**
 * Keystatic = the Studio (the Owner's editor), served at /keystatic behind Basic Auth.
 *
 * The file layout written here is mirrored by `src/content.config.ts`.
 * Change both together; see docs/content-model.md.
 */
import { collection, config, fields, singleton } from '@keystatic/core';
import { inline } from '@keystatic/core/content-components';

const REPO = 'mfalfath25/me' as const;

// Relative paths from a content file back to src/assets/, so Astro's image() can optimize them.
// `depth` = how many folders the content file sits below src/ (src/content/posts/en/x.mdoc → 3).
const assets = (sub: string, depth = 3) => ({
  directory: `src/assets/${sub}`,
  publicPath: `${'../'.repeat(depth)}assets/${sub}/`,
});

const refComponent = inline({
  label: 'Internal link',
  description: 'Link to another Post, Work, Photo, Link, Album, Tag or Series',
  schema: {
    kind: fields.select({
      label: 'Kind',
      defaultValue: 'post',
      options: [
        { label: 'Post', value: 'post' },
        { label: 'Work', value: 'work' },
        { label: 'Photo', value: 'photo' },
        { label: 'Link', value: 'link' },
        { label: 'Album', value: 'album' },
        { label: 'Tag', value: 'tag' },
        { label: 'Series', value: 'series' },
      ],
    }),
    slug: fields.text({ label: 'Slug', validation: { isRequired: true } }),
    label: fields.text({ label: 'Link text (optional, defaults to the target title)' }),
  },
});

const body = (label: string, assetDir: string, depth = 3) =>
  fields.markdoc({
    label,
    options: {
      image: assets(assetDir, depth),
      heading: [2, 3, 4],
    },
    components: { ref: refComponent },
  });

const titleAndSlug = (translation: boolean) =>
  fields.slug({
    name: { label: 'Title', validation: { isRequired: true } },
    slug: translation
      ? { label: 'Slug', description: 'Must match the English slug exactly so the two versions pair up.' }
      : { label: 'Slug', description: 'Becomes the URL. Changing it later breaks links.' },
  });

const publishing = {
  publishedAt: fields.date({
    label: 'Publish date',
    description: 'Future dates stay hidden until the daily scheduled rebuild on that day.',
    defaultValue: { kind: 'today' },
    validation: { isRequired: true },
  }),
  draft: fields.checkbox({ label: 'Draft', description: 'Drafts never reach the live site.', defaultValue: false }),
};

const tagsField = fields.multiRelationship({ label: 'Tags', collection: 'tags' });
const albumsField = fields.multiRelationship({ label: 'Albums', collection: 'albums' });

// ── Posts ─────────────────────────────────────────────────────────────
const postSchema = (translation: boolean) => ({
  title: titleAndSlug(translation),
  description: fields.text({
    label: 'Description',
    description: 'Used for SEO and previews. Aim for 120–160 characters.',
    multiline: true,
    validation: { isRequired: true, length: { max: 200 } },
  }),
  ...publishing,
  updatedAt: fields.date({ label: 'Last meaningful update' }),
  cover: fields.image({ label: 'Cover image', ...assets('posts') }),
  coverAlt: fields.text({ label: 'Cover alt text' }),
  tags: tagsField,
  series: fields.relationship({ label: 'Series', collection: 'series' }),
  seriesOrder: fields.integer({ label: 'Position in series' }),
  body: body('Body', 'posts'),
});

// ── Works ──────────────────────────────────────────────────────────
const workSchema = (translation: boolean) => ({
  title: titleAndSlug(translation),
  summary: fields.text({
    label: 'Overview',
    description: 'One or two sentences shown on cards and used as the SEO description.',
    multiline: true,
    validation: { isRequired: true, length: { max: 200 } },
  }),
  ...publishing,
  role: fields.text({ label: 'Role' }),
  period: fields.text({ label: 'Period', description: 'e.g. "2025 – present"' }),
  status: fields.select({
    label: 'Status',
    defaultValue: 'active',
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Shipped', value: 'shipped' },
      { label: 'Archived', value: 'archived' },
    ],
  }),
  stack: fields.array(fields.text({ label: 'Technology' }), {
    label: 'Stack',
    itemLabel: (p) => p.value,
  }),
  links: fields.array(
    fields.object({
      label: fields.text({ label: 'Label', validation: { isRequired: true } }),
      url: fields.url({ label: 'URL', validation: { isRequired: true } }),
    }),
    { label: 'Links', itemLabel: (p) => p.fields.label.value },
  ),
  cover: fields.image({ label: 'Cover image', ...assets('works') }),
  coverAlt: fields.text({ label: 'Cover alt text' }),
  featured: fields.checkbox({ label: 'Featured on home page', defaultValue: false }),
  order: fields.integer({ label: 'Sort order (lower first)', defaultValue: 100 }),
  tags: tagsField,
  body: body('Details', 'works'),
});

export default config({
  storage: import.meta.env.PROD ? { kind: 'github', repo: REPO } : { kind: 'local' },
  ui: {
    brand: { name: 'Studio' },
    navigation: {
      Writing: ['postsEn', 'postsId', 'series'],
      Archive: ['photos', 'links', 'albums'],
      Works: ['worksEn', 'worksId'],
      Site: ['tags', 'aboutEn', 'aboutId'],
    },
  },
  collections: {
    postsEn: collection({
      label: 'Posts · English',
      path: 'src/content/posts/en/*',
      slugField: 'title',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'publishedAt'],
      schema: postSchema(false),
    }),
    postsId: collection({
      label: 'Posts · Indonesian',
      path: 'src/content/posts/id/*',
      slugField: 'title',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'publishedAt'],
      schema: postSchema(true),
    }),
    series: collection({
      label: 'Series',
      path: 'src/content/series/*',
      slugField: 'title',
      format: 'yaml',
      schema: {
        title: titleAndSlug(false),
        description: fields.text({ label: 'Description', multiline: true }),
      },
    }),
    worksEn: collection({
      label: 'Works · English',
      path: 'src/content/works/en/*',
      slugField: 'title',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'status'],
      schema: workSchema(false),
    }),
    worksId: collection({
      label: 'Works · Indonesian',
      path: 'src/content/works/id/*',
      slugField: 'title',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'status'],
      schema: workSchema(true),
    }),
    photos: collection({
      label: 'Photos',
      path: 'src/content/archive/photos/*',
      slugField: 'title',
      format: 'yaml',
      columns: ['title', 'takenAt'],
      schema: {
        title: fields.slug({
          name: { label: 'Title', validation: { isRequired: true } },
          slug: { label: 'Slug', description: 'Also the fallback alt text if Alt is empty.' },
        }),
        image: fields.image({ label: 'Photo', validation: { isRequired: true }, ...assets('archive/photos') }),
        alt: fields.text({ label: 'Alt text', description: 'Leave empty to derive it from the title.' }),
        caption: fields.text({ label: 'Caption', multiline: true }),
        takenAt: fields.date({ label: 'Date taken' }),
        location: fields.text({ label: 'Location', description: 'City or place, used for filtering.' }),
        albums: albumsField,
        tags: tagsField,
        ...publishing,
        exif: fields.object(
          {
            camera: fields.text({ label: 'Camera' }),
            lens: fields.text({ label: 'Lens' }),
            focalLength: fields.text({ label: 'Focal length' }),
            aperture: fields.text({ label: 'Aperture' }),
            shutter: fields.text({ label: 'Shutter speed' }),
            iso: fields.text({ label: 'ISO' }),
          },
          { label: 'Camera details (filled automatically on push)' },
        ),
      },
    }),
    links: collection({
      label: 'Links',
      path: 'src/content/archive/links/*',
      slugField: 'title',
      format: 'yaml',
      columns: ['title', 'publishedAt'],
      schema: {
        title: fields.slug({
          name: { label: 'Title', description: 'Overwritten by the page title on push if left as the URL.' },
        }),
        url: fields.url({ label: 'URL', validation: { isRequired: true } }),
        note: fields.text({ label: 'Your note', multiline: true }),
        albums: albumsField,
        tags: tagsField,
        ...publishing,
        meta: fields.object(
          {
            siteName: fields.text({ label: 'Site name' }),
            description: fields.text({ label: 'Description', multiline: true }),
            image: fields.image({ label: 'Preview image', ...assets('archive/links') }),
            fetchedAt: fields.text({ label: 'Fetched at' }),
          },
          { label: 'Page preview (filled automatically on push)' },
        ),
      },
    }),
    albums: collection({
      label: 'Albums',
      path: 'src/content/albums/*',
      slugField: 'title',
      format: 'yaml',
      schema: {
        title: titleAndSlug(false),
        description: fields.text({ label: 'Description', multiline: true }),
        cover: fields.relationship({ label: 'Cover photo', collection: 'photos' }),
        order: fields.integer({ label: 'Sort order (lower first)', defaultValue: 100 }),
      },
    }),
    tags: collection({
      label: 'Tags',
      path: 'src/content/tags/*',
      slugField: 'name',
      format: 'yaml',
      schema: {
        name: fields.slug({ name: { label: 'Name', validation: { isRequired: true } } }),
        description: fields.text({ label: 'Description', multiline: true }),
      },
    }),
  },
  singletons: {
    aboutEn: singleton({
      label: 'About · English',
      path: 'src/content/pages/about-en',
      format: { contentField: 'body' },
      entryLayout: 'content',
      schema: {
        title: fields.text({ label: 'Title', validation: { isRequired: true } }),
        description: fields.text({ label: 'Description', multiline: true, validation: { isRequired: true } }),
        body: body('Body', 'pages', 2),
      },
    }),
    aboutId: singleton({
      label: 'About · Indonesian',
      path: 'src/content/pages/about-id',
      format: { contentField: 'body' },
      entryLayout: 'content',
      schema: {
        title: fields.text({ label: 'Title', validation: { isRequired: true } }),
        description: fields.text({ label: 'Description', multiline: true, validation: { isRequired: true } }),
        body: body('Body', 'pages', 2),
      },
    }),
  },
});
