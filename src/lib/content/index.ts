/**
 * The content module: the ONLY way pages and components read content.
 *
 * Today it reads Astro content collections (Markdoc/YAML files written by the Studio).
 * To move to a database later, re-implement these functions; callers stay unchanged.
 * See docs/adr/0001-content-access-module.md.
 */
export { getAlbumPaths, listAlbums, listArchiveItems, listLinks, listPhotos } from './archive';
export { getAboutPage } from './pages';
export { getPostPaths, listPosts, listPostsInSeries } from './posts';
export { getWorkPaths, listWorks } from './works';
export { resolveRef } from './refs';
export { getSeriesPaths, getTagPaths, listSeries, listTags, type TaggedContent } from './taxonomy';
export type * from './types';
