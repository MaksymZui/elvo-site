import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';

// Temporary GitHub Pages preview, see docs/DEPLOY.md. Without the variable: the real site
const isPagesPreview = process.env.PREVIEW === 'pages';

export default defineConfig({
  site: isPagesPreview ? 'https://maksymzui.github.io' : 'https://elvo.technology',
  base: isPagesPreview ? '/elvo-site/' : '/',
  output: 'static',
  integrations: isPagesPreview ? [] : [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Anybody',
      cssVariable: '--font-anybody',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            weight: '100 900',
            stretch: '50% 150%',
            style: 'normal',
            display: 'swap',
            src: ['./src/assets/fonts/anybody.woff2'],
          },
        ],
      },
    },
  ],
});
