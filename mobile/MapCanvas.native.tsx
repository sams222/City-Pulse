import { useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { GOOGLE_DARK_MAP_STYLE } from './googleDarkMapStyle';
import { MAP_CENTER } from './mapMarkers';
import {
  BASE_DELTA,
  deltaToScale,
  MinimalistMapMarker,
  UserMapMarker,
  MapBottomVignette,
  type MapCanvasProps,
} from './mapCanvasShared';

export type { MapMarkerData } from './mapCanvasShared';

const DELTA_THRESHOLD = 0.18;

/**
 * How long tracksViewChanges stays true after a mode transition (ms).
 * Must be > the 350 ms modeFade animation in MinimalistMapMarker.
 */
const TRACKS_WINDOW_MS = 450;

export function MapCanvas({ markers }: MapCanvasProps) {
  const [zoomedOut, setZoomedOut] = useState(false);

  /**
   * tracksViewChanges is expensive (forces layout sync every frame).
   * We only enable it briefly — during the icon↔dot cross-fade — then turn it
   * off again so continuous pan/pinch doesn't re-layout 22 markers per frame.
   */
  const [tracksViews, setTracksViews] = useState(true); // true on first mount so initial render lands
  const tracksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * One Animated.Value shared across all markers.
   * setValue() updates the native animation thread directly — zero JS renders.
   */
  const zoomScaleAnim = useRef(new Animated.Value(deltaToScale(BASE_DELTA))).current;

  /**
   * rAF handle so onRegionChange (fires ~60fps) only feeds one setValue()
   * per animation frame, keeping the JS thread free.
   */
  const rafRef = useRef<number | null>(null);

  function onRegionChange(region: Region) {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      zoomScaleAnim.setValue(deltaToScale(region.latitudeDelta));
      rafRef.current = null;
    });
  }

  function onRegionChangeComplete(region: Region) {
    // Cancel any pending rAF and apply the final value immediately
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    zoomScaleAnim.setValue(deltaToScale(region.latitudeDelta));

    const nextOut = region.latitudeDelta > DELTA_THRESHOLD;
    if (nextOut !== zoomedOut) {
      // Enable tracksViewChanges so the modeFade prop change reaches native
      setTracksViews(true);
      setZoomedOut(nextOut);

      // Turn it off after the cross-fade completes
      if (tracksTimerRef.current) clearTimeout(tracksTimerRef.current);
      tracksTimerRef.current = setTimeout(() => setTracksViews(false), TRACKS_WINDOW_MS);
    }
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={MAP_CENTER}
        customMapStyle={GOOGLE_DARK_MAP_STYLE}
        mapType="standard"
        userInterfaceStyle="dark"
        showsUserLocation={false}
        showsCompass={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}>
        {markers.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            title={m.label}
            description={m.time}
            // User pin tip is at the bottom-center; other pins anchor at center
            anchor={m.type === 'user' ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
            zIndex={m.zIndex ?? 0}
            tracksViewChanges={tracksViews}>
            {m.type === 'user'
              ? <UserMapMarker zoomScaleAnim={zoomScaleAnim} />
              : <MinimalistMapMarker marker={m} zoomedOut={zoomedOut} zoomScaleAnim={zoomScaleAnim} />
            }
          </Marker>
        ))}
      </MapView>
      <MapBottomVignette />
    </View>
  );
}
