/**
 * Loads the Google Maps JavaScript API once (web only).
 * Enable "Maps JavaScript API" for map tiles. Transit / route planning also needs "Directions API" on the same project.
 *
 * Prefer loading with `<script async src="...&libraries=places">` in `app/+html.tsx` so the browser
 * parses the tag as async (avoids "loaded without async" console noise). This module then waits
 * for `google.maps` or injects a single callback-based script if no bootstrap tag exists.
 */
export const GOOGLE_MAPS_WEB_SCRIPT_ID = 'citypulse-google-maps-js';

const MAPS_LIBRARIES = 'places';

function mapsBootstrapUrl(apiKey: string, callbackName?: string): string {
  const base = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=${encodeURIComponent(MAPS_LIBRARIES)}`;
  return callbackName ? `${base}&callback=${encodeURIComponent(callbackName)}` : base;
}

let loadPromise: Promise<void> | null = null;

/** Set when `gm_authFailure` runs (invalid key, API off, billing, HTTP referrer, etc.). */
let googleMapsAuthRejected = false;

function waitForGoogleMapsReady(timeoutMs = 45_000): Promise<void> {
  const g = () => (typeof window !== 'undefined' ? (window as unknown as { google?: { maps?: unknown } }).google : undefined);
  if (g()?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const id = window.setInterval(() => {
      if (g()?.maps) {
        window.clearInterval(id);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        window.clearInterval(id);
        reject(new Error('Google Maps JavaScript API did not become ready in time'));
      }
    }, 50);
  });
}

export function markGoogleMapsAuthRejected(): void {
  googleMapsAuthRejected = true;
  loadPromise = null;
}

export function wasGoogleMapsAuthRejected(): boolean {
  return googleMapsAuthRejected;
}

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (googleMapsAuthRejected) {
    return Promise.reject(new Error('Google Maps was rejected for this site (see console).'));
  }
  const g = window as unknown as { google?: { maps?: unknown } };
  if (g.google?.maps) return Promise.resolve();
  if (!apiKey) return Promise.reject(new Error('Missing Google Maps API key'));
  if (loadPromise) return loadPromise;

  const existing = document.getElementById(GOOGLE_MAPS_WEB_SCRIPT_ID);
  if (existing && !g.google?.maps) {
    loadPromise = waitForGoogleMapsReady().catch((err) => {
      loadPromise = null;
      throw err;
    });
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const name = `__cityPulseMapsCb_${Date.now()}`;
    const w = window as unknown as Record<string, () => void>;
    w[name] = () => {
      delete w[name];
      resolve();
    };
    const s = document.createElement('script');
    s.id = GOOGLE_MAPS_WEB_SCRIPT_ID;
    // Match Google's recommended bootstrap: async attribute + libraries (Places available if needed).
    s.setAttribute('async', '');
    s.async = true;
    s.src = mapsBootstrapUrl(apiKey, name);
    s.onerror = () => {
      delete w[name];
      loadPromise = null;
      reject(new Error('Could not load Google Maps JavaScript API'));
    };
    document.head.appendChild(s);
  });

  return loadPromise;
}
