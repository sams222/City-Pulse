/**
 * Metro bundles `MapCanvas.web.tsx` (web) or `MapCanvas.native.tsx` (iOS/Android).
 * This file satisfies TypeScript `import './MapCanvas'` when platform files exist.
 */
export type { MapMarkerData } from './mapCanvasShared';
export { MapCanvas } from './MapCanvas.web';
