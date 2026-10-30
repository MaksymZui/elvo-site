/** The GitHub Pages preview lives under a subpath, the real site never does. */
export const isPagesPreview = import.meta.env.BASE_URL !== '/';
