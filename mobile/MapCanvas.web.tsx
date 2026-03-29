import { useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { MAP_CENTER } from './mapMarkers';
import {
  CARTO_DARK,
  injectLeafletMarkerCss,
  leafletMarkerHtml,
  leafletUserPinHtml,
  MapBottomVignette,
  zoomLevelToScale,
  type MapCanvasProps,
  type MapMarkerData,
} from './mapCanvasShared';

export type { MapMarkerData } from './mapCanvasShared';

const ICON_ZOOM_THRESHOLD = 11;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Toggle icon/dot CSS mode on a marker's inner .cp-pin element.
 * We query the *child* `.cp-pin`, never the icon container itself,
 * so we never touch Leaflet's own translate3d positioning transform.
 */
function setMarkerMode(lm: L.Marker, zoomedOut: boolean): void {
  const pin = lm.getElement()?.querySelector('.cp-pin') as HTMLElement | null;
  if (!pin) return;
  pin.classList.toggle('cp-mode-dot', zoomedOut);
  pin.classList.toggle('cp-mode-icon', !zoomedOut);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MapCanvas({ markers }: MapCanvasProps) {
  const hostRef = useRef<View | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<MapMarkerData[]>(markers);
  const instancesRef = useRef<Map<string, L.Marker>>(new Map());
  const zoomedOutRef = useRef(false);
  const webScaleRef = useRef(1);

  // ── Initialise map once ───────────────────────────────────────────────────
  useLayoutEffect(() => {
    injectLeafletMarkerCss();
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const containerW = node.clientWidth || 390;
    webScaleRef.current = Math.max(0.75, Math.min(containerW / 390, 1.55));

    const map = L.map(node, {
      center: [MAP_CENTER.latitude, MAP_CENTER.longitude],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer(CARTO_DARK, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> ' +
        '&copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    groupRef.current = group;
    mapRef.current = map;

    // Apply initial scale via CSS variable — one write, scales all markers
    map.getContainer().style.setProperty('--cp-scale', String(zoomLevelToScale(13)));

    // Add initial markers
    addMissingMarkers(group, markersRef.current, webScaleRef.current);

    map.on('zoomend', () => {
      const zoom = map.getZoom();

      // ONE DOM write scales every .cp-pin via CSS variable — no per-marker loop needed
      map.getContainer().style.setProperty('--cp-scale', String(zoomLevelToScale(zoom)));

      // Per-marker mode toggle only when crossing the icon↔dot threshold
      const out = zoom < ICON_ZOOM_THRESHOLD;
      if (out !== zoomedOutRef.current) {
        zoomedOutRef.current = out;
        instancesRef.current.forEach((lm) => setMarkerMode(lm, out));
      }
    });

    const t = requestAnimationFrame(() => {
      map.invalidateSize();
      setTimeout(() => map.invalidateSize(), 250);
    });

    return () => {
      cancelAnimationFrame(t);
      map.remove();
      mapRef.current = null;
      groupRef.current = null;
      instancesRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync marker set when filter changes ──────────────────────────────────
  useEffect(() => {
    markersRef.current = markers;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!map || !group) return;

    const desiredIds = new Set(markers.map((m) => m.id));
    instancesRef.current.forEach((lm, id) => {
      if (!desiredIds.has(id)) {
        group.removeLayer(lm);
        instancesRef.current.delete(id);
      }
    });

    addMissingMarkers(group, markers, webScaleRef.current);
  }, [markers]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View ref={hostRef} style={styles.mapHost} />
      <MapBottomVignette />
    </View>
  );

  function addMissingMarkers(
    group: L.LayerGroup,
    list: MapMarkerData[],
    scale: number,
  ): void {
    const hitPx = Math.round(28 * scale);
    list.forEach((m) => {
      if (instancesRef.current.has(m.id)) return;

      const isUser = m.type === 'user';
      // User pin: teardrop anchored at the tip (bottom-center).
      // Regular pins: circle anchored at center.
      const pinS = Math.round(36 * scale);
      const pinH = Math.round(pinS * (0.5 + 1 / Math.SQRT2));
      const icon = L.divIcon({
        html: isUser ? leafletUserPinHtml(scale) : leafletMarkerHtml(m, scale),
        className: '',
        iconSize:   isUser ? [pinS, pinH]           : [hitPx, hitPx],
        iconAnchor: isUser ? [Math.round(pinS / 2), pinH] : [hitPx / 2, hitPx / 2],
      });

      const lm = L.marker([m.latitude, m.longitude], { icon, zIndexOffset: m.zIndex ?? 0 }).addTo(group);
      instancesRef.current.set(m.id, lm);
      // Sync icon/dot mode — user pin has no dot mode so setMarkerMode no-ops on it
      if (zoomedOutRef.current && !isUser) setMarkerMode(lm, true);
    });
  }
}

const styles = StyleSheet.create({
  mapHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
});
