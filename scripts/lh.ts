import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startPreview, URL_BASE } from './preview.ts';

const OUT = '.local/lighthouse';
const CATEGORIES = { performance: 90, accessibility: 95, 'best-practices': 0, seo: 95 };
const LCP_MS = 2500;
const CLS = 0.05;

await mkdir(OUT, { recursive: true });
const server = await startPreview();
const failures: string[] = [];

try {
  // Lighthouse defaults: mobile form factor, simulated slow 4G and 4x CPU slowdown
  const run = spawn(
    process.execPath,
    [
      'node_modules/lighthouse/cli/index.js',
      URL_BASE,
      '--quiet',
      `--only-categories=${Object.keys(CATEGORIES).join(',')}`,
      '--output=json',
      '--output=html',
      `--output-path=${OUT}/report`,
      '--chrome-flags=--headless=new --no-sandbox',
    ],
    { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, stdio: 'inherit' },
  );
  await once(run, 'close');

  const report = JSON.parse(await readFile(`${OUT}/report.report.json`, 'utf8'));

  for (const [id, minimum] of Object.entries(CATEGORIES)) {
    const score = Math.round(report.categories[id].score * 100);
    console.log(`${id}: ${score}`);
    if (score < minimum) failures.push(`${id} ${score} is below ${minimum}`);
  }

  const lcp = report.audits['largest-contentful-paint'].numericValue as number;
  const cls = report.audits['cumulative-layout-shift'].numericValue as number;
  const tbt = report.audits['total-blocking-time'].numericValue as number;
  console.log(`LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}, TBT ${Math.round(tbt)} ms`);
  if (lcp > LCP_MS) failures.push(`LCP ${Math.round(lcp)} ms`);
  if (cls > CLS) failures.push(`CLS ${cls.toFixed(3)}`);
} finally {
  server.kill();
}

if (failures.length > 0) {
  console.error(`\n${failures.join('\n')}`);
  process.exitCode = 1;
}
