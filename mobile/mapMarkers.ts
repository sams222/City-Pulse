import type { MapMarkerData } from './mapCanvasShared';

export const MAP_MARKERS: MapMarkerData[] = [
  // ── Safety ──────────────────────────────────────────────────────────────────
  { id: 's1', type: 'safety', icon: '🔥', label: 'Fire reported — E 52nd St',      time: 'now',        latitude: 40.7557, longitude: -73.9683, live: true },
  { id: 's2', type: 'safety', icon: '🚇', label: '2/3 train delayed',               time: '5 min ago',  latitude: 40.7505, longitude: -73.9934, live: true },
  { id: 's3', type: 'safety', icon: '🚧', label: 'Road closure — Canal St',          time: 'until 8 pm', latitude: 40.7192, longitude: -74.0001 },
  { id: 's4', type: 'safety', icon: '🚨', label: 'Police activity — 9th Ave',        time: '12 min ago', latitude: 40.7635, longitude: -73.9960, live: true },
  { id: 's5', type: 'safety', icon: '🌊', label: 'Flooding — FDR near 14th',         time: 'ongoing',    latitude: 40.7330, longitude: -73.9715 },
  { id: 's6', type: 'safety', icon: '⚠️', label: 'Gas leak — Fulton St',             time: '20 min ago', latitude: 40.7093, longitude: -74.0077 },
  { id: 's7', type: 'safety', icon: '🏗️', label: 'Scaffolding collapse — W 34th',   time: '1 hr ago',   latitude: 40.7488, longitude: -73.9980 },

  // ── Community ────────────────────────────────────────────────────────────────
  { id: 'c1', type: 'community', icon: '🎵', label: 'Live jazz — Bryant Park',         time: 'in 2 hours', latitude: 40.7536, longitude: -73.9832 },
  { id: 'c2', type: 'community', icon: '🧹', label: 'Community cleanup — LES',          time: 'at 5 PM',    latitude: 40.7159, longitude: -73.9840 },
  { id: 'c3', type: 'community', icon: '🥕', label: 'Farmers market — Grand Central',   time: 'until 4 PM', latitude: 40.7527, longitude: -73.9757 },
  { id: 'c4', type: 'community', icon: '🎨', label: 'Street art festival — SoHo',       time: 'all day',    latitude: 40.7233, longitude: -73.9987 },
  { id: 'c5', type: 'community', icon: '🧘', label: 'Sunrise yoga — Riverside Park',    time: 'at 7 AM',    latitude: 40.7980, longitude: -73.9710 },
  { id: 'c6', type: 'community', icon: '🎉', label: 'Block party — Harlem',             time: 'from 3 PM',  latitude: 40.8090, longitude: -73.9510 },
  { id: 'c7', type: 'community', icon: '🎬', label: 'Film screening — High Line',       time: 'at 8 PM',    latitude: 40.7480, longitude: -74.0048 },
  { id: 'c8', type: 'community', icon: '🎤', label: 'Open mic — East Village',          time: 'at 9 PM',    latitude: 40.7265, longitude: -73.9795 },

  // ── Bathrooms ────────────────────────────────────────────────────────────────
  { id: 'b1', type: 'bathroom', icon: '🚽', label: 'Bryant Park — public restrooms',   time: 'open now', latitude: 40.7537, longitude: -73.9839 },
  { id: 'b2', type: 'bathroom', icon: '🚽', label: 'Central Park — Heckscher',          time: 'open now', latitude: 40.7680, longitude: -73.9770 },
  { id: 'b3', type: 'bathroom', icon: '🚽', label: 'Washington Square Park',            time: 'open now', latitude: 40.7307, longitude: -73.9970 },
  { id: 'b4', type: 'bathroom', icon: '🚽', label: 'Madison Square Park',               time: 'open now', latitude: 40.7424, longitude: -73.9877 },
  { id: 'b5', type: 'bathroom', icon: '🚽', label: 'Penn Station concourse',            time: 'open now', latitude: 40.7502, longitude: -73.9920 },
  { id: 'b6', type: 'bathroom', icon: '🚽', label: 'East River Park',                   time: 'open now', latitude: 40.7142, longitude: -73.9760 },
  { id: 'b7', type: 'bathroom', icon: '🚽', label: 'Riverside Park — 72nd St',          time: 'open now', latitude: 40.7797, longitude: -73.9882 },
];

/** Hardcoded user location pin — always visible, not part of category filters. */
export const USER_MARKER: MapMarkerData = {
  id: 'user',
  type: 'user',
  icon: '🧍',
  label: 'You',
  time: 'now',
  latitude: 40.7549,
  longitude: -73.984,
  zIndex: 999,
};

export const MAP_CENTER = {
  latitude: 40.7549,
  longitude: -73.984,
  latitudeDelta: 0.055,
  longitudeDelta: 0.055,
};
