import { spawn, type ChildProcess } from 'node:child_process';

export const PORT = 4329;
export const URL_BASE = `http://localhost:${PORT}/`;

/** Serves dist/ with `astro preview` and resolves once it answers. */
export async function startPreview(): Promise<ChildProcess> {
  const server = spawn(
    process.execPath,
    ['node_modules/astro/bin/astro.mjs', 'preview', '--port', String(PORT)],
    { stdio: 'ignore' },
  );

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(URL_BASE);
      if (response.ok) return server;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  server.kill();
  throw new Error('astro preview did not start; run `npm run build` first');
}
