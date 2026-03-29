import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';

import type {
  MapCanvasHandle,
  MapCanvasPin,
  MapCoordinate,
  MapPolyline,
  MapRegion,
  MapTheme,
} from '@/components/map/mapTypes';
import { NATIVE_MAP_STYLE_DARK, NATIVE_MAP_STYLE_LIGHT } from '@/lib/mapNativeStyle';
import { USER_HERE_PIN_FILL } from '@/lib/mapUserLocationPin';
import { androidHasGoogleMapsKey } from '@/lib/mapsEnv';

type LongPressEvt = { nativeEvent: { coordinate: MapCoordinate } };
type PressEvt = { nativeEvent: { coordinate: MapCoordinate } };

type Props = {
  style?: object;
  initialRegion: MapRegion;
  pins: MapCanvasPin[];
  polylines?: MapPolyline[];
  mapTheme: MapTheme;
  /** When set, shows a purple “you are here” pin at the user’s current coordinates. */
  userLocation?: MapCoordinate;
  onLongPress?: (e: LongPressEvt) => void;
  onPress?: (coord: MapCoordinate) => void;
};

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  { style, initialRegion, pins, polylines = [], mapTheme, userLocation, onLongPress, onPress },
  ref,
) {
  const inner = useRef<MapView>(null);
  const mapProvider =
    Platform.OS === 'android' && androidHasGoogleMapsKey() ? PROVIDER_GOOGLE : undefined;
  const customMapStyle: MapStyleElement[] | undefined =
    Platform.OS === 'android' && mapProvider === PROVIDER_GOOGLE
      ? mapTheme === 'dark'
        ? (NATIVE_MAP_STYLE_DARK as MapStyleElement[])
        : (NATIVE_MAP_STYLE_LIGHT as MapStyleElement[])
      : undefined;

  const mapSurfaceColor = mapTheme === 'dark' ? '#0f172a' : '#ffffff';

  useImperativeHandle(ref, () => ({
    animateToRegion: (region: MapRegion, duration = 500) => {
      inner.current?.animateToRegion(region, duration);
    },
  }));

  return (
    <View style={{ flex: 1, backgroundColor: mapSurfaceColor }}>
      <MapView
        ref={inner}
        style={[{ flex: 1, backgroundColor: mapSurfaceColor }, style]}
        provider={mapProvider}
        initialRegion={initialRegion}
        customMapStyle={customMapStyle}
        mapType="standard"
        loadingBackgroundColor={mapSurfaceColor}
        onLongPress={onLongPress}
        onPress={
          onPress
            ? (e: PressEvt) => {
                onPress(e.nativeEvent.coordinate);
              }
            : undefined
        }>
      {polylines.map((pl) => (
        <Polyline
          key={pl.id}
          coordinates={pl.coordinates}
          strokeColor={pl.strokeColor}
          strokeWidth={pl.strokeWidth ?? 5}
        />
      ))}
      {pins.map((p) => {
        const coord = { latitude: p.latitude, longitude: p.longitude };
        const zIndex =
          p.layer === 'bathrooms' ? 20 : p.layer === 'incidents' ? 15 : p.layer === 'quests' ? 14 : 12;
        return (
          <Marker
            key={p.id}
            coordinate={coord}
            title={p.title}
            description={p.description}
            pinColor={p.color}
            tracksViewChanges={false}
            zIndex={zIndex}
            onPress={p.onPress}
          />
        );
      })}
      {userLocation ? (
        <Marker
          coordinate={userLocation}
          title="You are here"
          pinColor={USER_HERE_PIN_FILL}
          tracksViewChanges={false}
          zIndex={999}
        />
      ) : null}
      </MapView>
    </View>
  );
});

MapCanvas.displayName = 'MapCanvas';

export default MapCanvas;
