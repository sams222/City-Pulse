export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapMarkerLayer = 'events' | 'incidents' | 'bathrooms' | 'quests';

export type MapPinDetailMeta =
  | { kind: 'event'; id: string }
  | { kind: 'incident'; id: string }
  | { kind: 'bathroom'; id: string }
  | { kind: 'quest'; id: string };

export type MapCanvasPin = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
  color: string;
  useCircleMarker: boolean;
  layer: MapMarkerLayer;
  iconName: 'calendar' | 'warning' | 'water' | 'flag';
  onPress?: () => void;
  detailMeta?: MapPinDetailMeta;
};

export type MapPolyline = {
  id: string;
  coordinates: { latitude: number; longitude: number }[];
  strokeColor: string;
  strokeWidth?: number;
};

export type MapCanvasHandle = {
  animateToRegion: (region: MapRegion, duration?: number) => void;
};

export type MapCoordinate = { latitude: number; longitude: number };

export type MapTheme = 'light' | 'dark';
