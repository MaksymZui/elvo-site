import type { APIRoute } from 'astro';
import { isPagesPreview } from '../lib/build';

const open = (sitemap: URL) => `User-agent: *
Allow: /

Sitemap: ${sitemap.href}
`;

const closed = `User-agent: *
Disallow: /
`;

export const GET: APIRoute = ({ site }) =>
  new Response(isPagesPreview ? closed : open(new URL('sitemap-index.xml', site)));
