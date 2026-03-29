import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type {
  MapCanvasHandle,
  MapCanvasPin,
  MapCoordinate,
  MapPolyline,
  MapRegion,
  MapTheme,
} from '@/components/map/mapTypes';
import { CITYPULSE_MAP_STYLES } from '@/lib/mapDarkStyle';
import {
  loadGoogleMapsScript,
  markGoogleMapsAuthRejected,
  wasGoogleMapsAuthRejected,
} from '@/lib/loadGoogleMapsForWeb';
import { loadLeaflet, type LeafletModule } from '@/lib/loadLeafletForWeb';
import { googleMapsJavascriptApiKey } from '@/lib/mapsEnv';
import { PIN_BATHROOM_BLUE } from '@/lib/mapMarkerLayers';
import { USER_HERE_PIN_FILL } from '@/lib/mapUserLocationPin';

type Props = {
  style?: object;
  initialRegion: MapRegion;
  pins: MapCanvasPin[];
  polylines?: MapPolyline[];
  mapTheme: MapTheme;
  userLocation?: MapCoordinate;
  onPress?: (coord: MapCoordinate) => void;
};

function regionToZoom(latitudeDelta: number): number {
  const d = Math.max(latitudeDelta, 0.001);
  const z = Math.log2(360 / d) - 8;
  return Math.max(12, Math.min(18, Math.round(z)));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isTileLayer(L: LeafletModule, layer: unknown): boolean {
  return layer != null && layer instanceof L.TileLayer;
}

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  { style, initialRegion, pins, polylines = [], mapTheme, userLocation, onPress },
  ref,
) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const googlePolyRefs = useRef<google.maps.Polyline[]>([]);
  const leafletMapRef = useRef<unknown>(null);
  const leafletMarkersRef = useRef<unknown[]>([]);
  const leafletPolyRefs = useRef<unknown[]>([]);
  const mapThemeRef = useRef(mapTheme);
  mapThemeRef.current = mapTheme;
  const pendingRegionRef = useRef<MapRegion | null>(null);
  const onPressRef = useRef<Props['onPress']>(undefined);
  onPressRef.current = onPress;

  const [activeMap, setActiveMap] = useState<'google' | 'leaflet' | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);

  const applyGoogleRegion = (region: MapRegion) => {
    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps) return;
    map.panTo({ lat: region.latitude, lng: region.longitude });
    map.setZoom(regionToZoom(region.latitudeDelta));
  };

  const applyLeafletRegion = (region: MapRegion) => {
    const m = leafletMapRef.current as { setView: (ll: [number, number], z: number) => void } | null;
    if (!m) return;
    m.setView([region.latitude, region.longitude], regionToZoom(region.latitudeDelta));
  };

  useImperativeHandle(ref, () => ({
    animateToRegion: (region: MapRegion) => {
      if (mapInstanceRef.current && window.google?.maps) {
        applyGoogleRegion(region);
      } else if (leafletMapRef.current) {
        applyLeafletRegion(region);
      } else {
        pendingRegionRef.current = region;
      }
    },
  }));

  const mapSurfaceColor = mapTheme === 'dark' ? '#0f172a' : '#ffffff';

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (activeMap !== 'google' || !googleReady || !map) return;
    map.setOptions({
      styles: mapTheme === 'dark' ? (CITYPULSE_MAP_STYLES as google.maps.MapTypeStyle[]) : [],
      backgroundColor: mapSurfaceColor,
    });
  }, [mapTheme, activeMap, googleReady, mapSurfaceColor]);

  useEffect(() => {
    let cancelled = false;
    const w = window as Window & { gm_authFailure?: () => void };
    const previousAuthFailure = w.gm_authFailure;

    const onGoogleAuthFailure = () => {
      markGoogleMapsAuthRejected();
      mapInstanceRef.current = null;
      setGoogleReady(false);
      if (mapDivRef.current) mapDivRef.current.innerHTML = '';
      setActiveMap('leaflet');
    };

    w.gm_authFailure = onGoogleAuthFailure;

    (async () => {
      const key = googleMapsJavascriptApiKey();
      try {
        await loadGoogleMapsScript(key);
        if (cancelled || wasGoogleMapsAuthRejected()) {
          setActiveMap('leaflet');
          return;
        }
        if (!mapDivRef.current) return;
        const center = { lat: initialRegion.latitude, lng: initialRegion.longitude };
        const themeNow = mapThemeRef.current;
        const map = new google.maps.Map(mapDivRef.current, {
          center,
          zoom: regionToZoom(initialRegion.latitudeDelta),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          backgroundColor: themeNow === 'dark' ? '#0f172a' : '#ffffff',
          styles: themeNow === 'dark' ? (CITYPULSE_MAP_STYLES as google.maps.MapTypeStyle[]) : [],
        });
        if (cancelled || wasGoogleMapsAuthRejected()) {
          setActiveMap('leaflet');
          return;
        }
        mapInstanceRef.current = map;
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          const ll = e.latLng;
          if (!ll) return;
          onPressRef.current?.({ latitude: ll.lat(), longitude: ll.lng() });
        });
        setActiveMap('google');
        setGoogleReady(true);
        const pending = pendingRegionRef.current;
        if (pending) {
          pendingRegionRef.current = null;
          applyGoogleRegion(pending);
        }
      } catch {
        if (!cancelled) setActiveMap('leaflet');
      }
    })();

    return () => {
      cancelled = true;
      setGoogleReady(false);
      mapInstanceRef.current = null;
      if (w.gm_authFailure === onGoogleAuthFailure) {
        w.gm_authFailure = previousAuthFailure;
      }
    };
  }, [initialRegion.latitude, initialRegion.longitude, initialRegion.latitudeDelta]);

  /** Create Leaflet map once; basemap theme is swapped in a separate effect (avoids wiping markers). */
  useEffect(() => {
    if (activeMap !== 'leaflet') return;
    let cancelled = false;

    (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapDivRef.current) return;
        if (mapDivRef.current.innerHTML) mapDivRef.current.innerHTML = '';

        const map = L.map(mapDivRef.current).setView(
          [initialRegion.latitude, initialRegion.longitude],
          regionToZoom(initialRegion.latitudeDelta),
        );
        const theme = mapThemeRef.current;
        const tileUrl =
          theme === 'dark'
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        L.tileLayer(tileUrl, {
          attribution: theme === 'dark' ? '&copy; OSM &copy; CARTO' : '&copy; OpenStreetMap',
          subdomains: theme === 'dark' ? 'abcd' : 'abc',
          maxZoom: 20,
        }).addTo(map);

        map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
          onPressRef.current?.({ latitude: e.latlng.lat, longitude: e.latlng.lng });
        });

        leafletMapRef.current = map;
        setLeafletReady(true);

        requestAnimationFrame(() => {
          try {
            map.invalidateSize();
          } catch {
            /* ignore */
          }
        });

        const pending = pendingRegionRef.current;
        if (pending) {
          pendingRegionRef.current = null;
          applyLeafletRegion(pending);
        }
      } catch {
        setLeafletReady(false);
      }
    })();

    return () => {
      cancelled = true;
      setLeafletReady(false);
      try {
        (leafletMapRef.current as { remove: () => void } | null)?.remove();
      } catch {
        /* ignore */
      }
      leafletMapRef.current = null;
      leafletMarkersRef.current = [];
      leafletPolyRefs.current = [];
    };
  }, [activeMap, initialRegion.latitude, initialRegion.longitude, initialRegion.latitudeDelta]);

  /** Swap OSM/CARTO tiles only — map instance and markers stay mounted. */
  useEffect(() => {
    if (activeMap !== 'leaflet' || !leafletReady || !leafletMapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !leafletMapRef.current) return;
      const map = leafletMapRef.current as {
        eachLayer: (fn: (layer: unknown) => void) => void;
        removeLayer: (layer: unknown) => void;
        addLayer: (layer: unknown) => unknown;
      };
      map.eachLayer((layer) => {
        if (isTileLayer(L, layer)) {
          try {
            map.removeLayer(layer);
          } catch {
            /* ignore */
          }
        }
      });
      const tileUrl =
        mapTheme === 'dark'
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      L.tileLayer(tileUrl, {
        attribution: mapTheme === 'dark' ? '&copy; OSM &copy; CARTO' : '&copy; OpenStreetMap',
        subdomains: mapTheme === 'dark' ? 'abcd' : 'abc',
        maxZoom: 20,
      }).addTo(map as never);
    })();

    return () => {
      cancelled = true;
    };
  }, [mapTheme, leafletReady, activeMap]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (activeMap !== 'google' || !googleReady || !map || !window.google?.maps) return;

    for (const m of markersRef.current) {
      m.setMap(null);
    }
    markersRef.current = [];

    for (const p of pins) {
      const icon: google.maps.Icon | google.maps.Symbol =
        p.layer === 'bathrooms'
          ? ({
              path: google.maps.SymbolPath.CIRCLE,
              scale: 11,
              fillColor: PIN_BATHROOM_BLUE,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            } as unknown as google.maps.Icon)
          : ({
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: p.color,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            } as unknown as google.maps.Icon);

      const marker = new google.maps.Marker({
        position: { lat: p.latitude, lng: p.longitude },
        map,
        title: p.title,
        icon: icon as google.maps.Icon | google.maps.Symbol,
      });

      const body =
        p.description != null && p.description.length > 0
          ? `${escapeHtml(p.title)}<br/><small>${escapeHtml(p.description)}</small>`
          : escapeHtml(p.title);
      const iw = new google.maps.InfoWindow({
        content: `<div style="max-width:240px;padding:4px 0">${body}</div>`,
      });
      marker.addListener('click', () => {
        if (p.onPress) {
          p.onPress();
          return;
        }
        iw.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
    }

    if (userLocation && window.google?.maps) {
      const um = new google.maps.Marker({
        position: { lat: userLocation.latitude, lng: userLocation.longitude },
        map,
        title: 'You are here',
        zIndex: 999,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: USER_HERE_PIN_FILL,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        } as unknown as google.maps.Icon,
      });
      markersRef.current.push(um);
    }
  }, [activeMap, googleReady, pins, userLocation]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (activeMap !== 'google' || !googleReady || !map || !window.google?.maps) return;
    for (const pl of googlePolyRefs.current) {
      pl.setMap(null);
    }
    googlePolyRefs.current = [];
    for (const pl of polylines) {
      const line = new google.maps.Polyline({
        path: pl.coordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })),
        strokeColor: pl.strokeColor,
        strokeWeight: pl.strokeWidth ?? 5,
        map,
      });
      googlePolyRefs.current.push(line);
    }
  }, [activeMap, googleReady, polylines]);

  useEffect(() => {
    if (activeMap !== 'leaflet' || !leafletReady || !leafletMapRef.current) return;

    (async () => {
      const L = await loadLeaflet();
      const map = leafletMapRef.current;
      if (!map) return;

      for (const m of leafletMarkersRef.current as { remove: () => void }[]) {
        try {
          m.remove();
        } catch {
          /* ignore */
        }
      }
      leafletMarkersRef.current = [];

      for (const pl of leafletPolyRefs.current as { remove: () => void }[]) {
        try {
          pl.remove();
        } catch {
          /* ignore */
        }
      }
      leafletPolyRefs.current = [];

      for (const p of pins) {
        let html: string;
        let size: number;
        if (p.layer === 'bathrooms') {
          html = `<div style="width:22px;height:22px;border-radius:50%;background:${PIN_BATHROOM_BLUE};border:2px solid #fff;box-sizing:border-box"></div>`;
          size = 22;
        } else {
          html = `<div style="width:20px;height:20px;border-radius:50%;background:${p.color};border:2px solid #fff;box-sizing:border-box"></div>`;
          size = 20;
        }
        const icon = L.divIcon({
          className: '',
          html,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const c = L.marker([p.latitude, p.longitude], { icon }).addTo(map);
        const popupHtml =
          p.description != null && p.description.length > 0
            ? `<b>${escapeHtml(p.title)}</b><br/>${escapeHtml(p.description)}`
            : `<b>${escapeHtml(p.title)}</b>`;
        c.bindPopup(popupHtml);
        c.on('click', () => {
          if (p.onPress) p.onPress();
        });
        leafletMarkersRef.current.push(c);
      }

      if (userLocation) {
        const html = `<div style="width:20px;height:20px;border-radius:50%;background:${USER_HERE_PIN_FILL};border:2px solid #fff;box-sizing:border-box"></div>`;
        const icon = L.divIcon({
          className: '',
          html,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        const u = L.marker([userLocation.latitude, userLocation.longitude], { icon, zIndexOffset: 1000 }).addTo(
          map,
        );
        u.bindPopup('<b>You are here</b>');
        leafletMarkersRef.current.push(u);
      }

      for (const pl of polylines) {
        const latlngs = pl.coordinates.map((c) => [c.latitude, c.longitude]);
        const poly = L.polyline(latlngs, {
          color: pl.strokeColor,
          weight: pl.strokeWidth ?? 5,
          opacity: 0.92,
        }).addTo(map);
        leafletPolyRefs.current.push(poly);
      }
    })();
  }, [activeMap, leafletReady, pins, polylines, userLocation]);

  const showOsmBanner = activeMap === 'leaflet';
  const osmBannerText = (() => {
    if (!showOsmBanner) return '';
    const key = googleMapsJavascriptApiKey();
    if (!key) {
      return 'OpenStreetMap fallback — no GOOGLE_MAPS_API_KEY in this build. Add it to City-Pulse/.env and run npm run export:web before deploy.';
    }
    if (wasGoogleMapsAuthRejected()) {
      const here =
        typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/*`
          : 'https://YOUR-SITE.web.app/*';
      return `OpenStreetMap fallback — Google blocked your Maps key for this page. In Google Cloud → Credentials → your browser key → Website restrictions, add ${here} (and http://localhost:* for local). Enable Maps JavaScript API + billing.`;
    }
    return `${mapTheme === 'dark' ? 'Dark' : 'Light'} basemap (OpenStreetMap) — Google Maps failed to load; check network or key quotas.`;
  })();

  return (
    <View style={[styles.wrap, style, { backgroundColor: mapSurfaceColor }]}>
      <div
        ref={mapDivRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 280,
          backgroundColor: mapSurfaceColor,
        }}
      />
      {showOsmBanner ? (
        <View style={styles.osmBanner} pointerEvents="none">
          <Text style={styles.osmBannerText}>{osmBannerText}</Text>
        </View>
      ) : null}
    </View>
  );
});

MapCanvas.displayName = 'MapCanvas';

const styles = StyleSheet.create({
  wrap: { flex: 1, alignSelf: 'stretch', width: '100%' },
  osmBanner: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(15,23,42,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  osmBannerText: {
    color: '#e2e8f0',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
});

export default MapCanvas;
