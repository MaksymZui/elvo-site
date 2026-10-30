import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createGzip } from 'node:zlib';

export const PORT = 4329;
export const isPagesPreview = process.env.PREVIEW === 'pages';
const BASE = isPagesPreview ? '/elvo-site/' : '/';
export const URL_BASE = `http://localhost:${PORT}${BASE}`;

const ROOT = 'dist';
/** Same as nginx in production: Lighthouse timings mean nothing on uncompressed text. */
const GZIP = new Set(['.html', '.css', '.js', '.svg', '.xml', '.txt']);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

/** Serves dist/. Not `astro preview`: it allows one server per project, and one may be running. */
export async function startPreview(): Promise<{ kill: () => void }> {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', URL_BASE);
    const file = join(
      ROOT,
      normalize(pathname.slice(BASE.length)),
      pathname.endsWith('/') ? 'index.html' : '',
    );

    // Nothing outside the base exists, as on Pages: a path that forgot it must fail here too
    if (!pathname.startsWith(BASE) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    const type = extname(file);
    const gzip = GZIP.has(type) && String(request.headers['accept-encoding']).includes('gzip');
    response.writeHead(200, {
      'Content-Type': TYPES[type] ?? 'application/octet-stream',
      ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
    });
    const body = createReadStream(file);
    (gzip ? body.pipe(createGzip()) : body).pipe(response);
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  return {
    kill: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
