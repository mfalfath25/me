import { getCollection, render } from 'astro:content';

import type { Locale } from '@/i18n/config';

import { isHidden, isVisible, pickLocalized, resolveTags } from './shared';
import type { Project } from './types';

export async function listProjects(locale: Locale): Promise<Project[]> {
  const entries = await getCollection('projects', ({ data }) => isVisible(data));
  const projects = await Promise.all(
    pickLocalized(entries, locale).map(async ({ entry, slug, locale: shown, isFallback, availableLocales }) => {
      const d = entry.data;
      return {
        slug,
        locale: shown,
        isFallback,
        availableLocales,
        isHidden: isHidden(d),
        title: d.title,
        summary: d.summary,
        publishedAt: d.publishedAt,
        role: d.role ?? null,
        period: d.period ?? null,
        status: d.status,
        stack: d.stack ?? [],
        links: d.links ?? [],
        cover: d.cover ?? null,
        coverAlt: d.coverAlt?.trim() || d.title,
        featured: d.featured,
        order: d.order,
        tags: await resolveTags(d.tags),
        render: () => render(entry),
      } satisfies Project;
    }),
  );
  return projects.sort((a, b) => a.order - b.order || b.publishedAt.getTime() - a.publishedAt.getTime());
}

export async function getProjectPaths(locale: Locale) {
  const projects = await listProjects(locale);
  return projects.map((project) => ({ params: { slug: project.slug }, props: { project } }));
}
