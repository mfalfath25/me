import type { APIRoute } from 'astro';

import { postsFeed } from '@/lib/feeds';

export const GET: APIRoute = ({ site }) => postsFeed('id', site!);
