/**
 * Leaflet + OSM tiles (no API key). Used as a web fallback when Google Maps fails.
 */

// Loaded from CDN; types are intentionally loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LeafletModule = any;

let leafletPromise: Promise<LeafletModule> | null = null;

export function loadLeaflet(): Promise<LeafletModule> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet is web-only'));
  }
  const w = window as unknown as { L?: LeafletModule };
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.async = true;
    s.onload = () => {
      const L = (window as unknown as { L?: LeafletModule }).L;
      if (L) resolve(L);
      else reject(new Error('Leaflet global missing'));
    };
    s.onerror = () => {
      leafletPromise = null;
      reject(new Error('Could not load Leaflet'));
    };
    document.head.appendChild(s);
  });

  return leafletPromise;
}
