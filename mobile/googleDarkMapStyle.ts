/**
 * Google Maps JSON style — dark, high-contrast (approximates tile-dark look on Android / Google provider).
 * @see https://developers.google.com/maps/documentation/ios-sdk/styling
 */
export const GOOGLE_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { elementType: 'geometry.fill', stylers: [{ color: '#121212' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d0d0d' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1c1c1c' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#152015' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b2b2b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#222222' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#2f2f2f' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#262626' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e1e1e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1418' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a5a60' }] },
];
