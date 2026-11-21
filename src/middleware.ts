/**
 * Locks the Studio (/keystatic and its API) behind HTTP Basic Auth.
 * Layer 1 of 2: Keystatic's own GitHub login sits behind this.
 *
 * Fails closed: in production, if the credentials are not configured, nobody gets in.
 * In `astro dev` the gate is skipped so local editing just works.
 */
import { defineMiddleware } from 'astro:middleware';
import { getSecret } from 'astro:env/server';

const PROTECTED = /^\/(api\/)?keystatic(\/|$)/;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function isAuthorized(header: string | null): boolean {
  const expectedUser = getSecret('STUDIO_BASIC_AUTH_USER')?.trim();
  const expectedPass = getSecret('STUDIO_BASIC_AUTH_PASSWORD')?.trim();
  if (!expectedUser || !expectedPass) return false;
  if (!header?.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  const userOk = timingSafeEqual(decoded.slice(0, sep), expectedUser);
  const passOk = timingSafeEqual(decoded.slice(sep + 1), expectedPass);
  return userOk && passOk;
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (!PROTECTED.test(context.url.pathname)) return next();

  if (!import.meta.env.DEV && !isAuthorized(context.request.headers.get('authorization'))) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="studio", charset="UTF-8"',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    });
  }

  const response = await next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
