/**
 * Public assets are referenced at runtime (GLTFLoader, <img src>), not through Vite's
 * import pipeline, so a leading "/" always resolves to the domain root -- broken once the
 * site is deployed under a subpath (e.g. GitHub Pages project sites: /repo-name/).
 * Prefix with Vite's own BASE_URL instead.
 */
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
