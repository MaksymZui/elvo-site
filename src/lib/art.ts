import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

const WIDTHS = [360, 768, 1280, 1920];
const FORMATS = ['avif', 'webp'] as const;
const QUALITY = { avif: 50, webp: 72 };
const DESKTOP_FROM = 768;

export interface ArtSource {
  media: string;
  type: string;
  srcset: string;
  sizes: string;
  width: number;
  height: number;
}

/** `<source>` data for two crops; Astro's <Picture> has no per-source `media`. */
export async function artSources(
  mobile: ImageMetadata,
  desktop: ImageMetadata,
  sizes: string,
): Promise<ArtSource[]> {
  const crops = [
    { src: desktop, media: `(min-width: ${DESKTOP_FROM}px)` },
    { src: mobile, media: `(max-width: ${DESKTOP_FROM - 1}px)` },
  ];

  return Promise.all(
    crops.flatMap(({ src, media }) =>
      FORMATS.map(async (format) => {
        const image = await getImage({
          src,
          format,
          widths: WIDTHS,
          sizes,
          quality: QUALITY[format],
        });
        return {
          media,
          type: `image/${format}`,
          srcset: image.srcSet.attribute,
          sizes,
          width: src.width,
          height: src.height,
        };
      }),
    ),
  );
}
