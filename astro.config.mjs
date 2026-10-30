import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  site: 'https://elvo.technology',
  output: 'static',
  integrations: [sitemap()],
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
