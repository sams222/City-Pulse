/**
 * Android Google Maps JSON styles (same idea as web). iOS MapKit ignores customMapStyle.
 * Light = default roads (no override). Dark = night-style base.
 */
export const NATIVE_MAP_STYLE_LIGHT: object[] = [];

/** Compact night style for react-native-maps `customMapStyle` (Android). */
export const NATIVE_MAP_STYLE_DARK: object[] = [
  { elementType: 'geometry', stylers: [{ color: '#1E2130' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9AA0B8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1E2130' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C3044' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#162030' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252838' }] },
];
