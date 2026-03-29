import Constants from 'expo-constants';
import { Platform } from 'react-native';

type Extra = { googleMapsApiKey?: string; googleMapsRoutesApiKey?: string };

function keyFromExtra(): string {
  return (Constants.expoConfig?.extra as Extra | undefined)?.googleMapsApiKey?.trim() ?? '';
}

function routesKeyFromExtra(): string {
  return (Constants.expoConfig?.extra as Extra | undefined)?.googleMapsRoutesApiKey?.trim() ?? '';
}

/** Legacy fallbacks if you still use EXPO_PUBLIC_ vars. */
const legacyPublic = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();
const legacyRoutesPublic = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_ROUTES_API_KEY ?? '').trim();
const androidSpecific = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '').trim();
const iosSpecific = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ?? '').trim();

const shared = keyFromExtra() || legacyPublic;

/**
 * Map tiles, Places, and the Maps JavaScript bootstrap (`GOOGLE_MAPS_API_KEY`).
 * If only `GOOGLE_MAPS_ROUTES_API_KEY` is set, uses that so the map still loads (same Cloud key often enables both).
 */
export function googleMapsJavascriptApiKey(): string {
  const primary = shared || legacyPublic || androidSpecific || iosSpecific;
  if (primary) return primary;
  return routesKeyFromExtra() || legacyRoutesPublic;
}

/**
 * Directions API (transit / driving / walking JSON) — `GOOGLE_MAPS_ROUTES_API_KEY` in City-Pulse `.env`.
 * If unset, uses the same sources as the main Maps key (single-key setups).
 */
export function googleMapsRoutesApiKey(): string {
  const r = routesKeyFromExtra() || legacyRoutesPublic;
  if (r) return r;
  return shared || legacyPublic || androidSpecific || iosSpecific;
}

export function isGoogleMapsConfigured(): boolean {
  return Boolean(googleMapsJavascriptApiKey());
}

/** Shows that a key loaded without exposing the full secret (Profile / debug). */
export function googleMapsKeyPreview(): string {
  const k = googleMapsJavascriptApiKey();
  if (!k) return 'Not set — add GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_ROUTES_API_KEY to .env (then restart Expo)';
  if (k.length <= 12) return '•••••••• (too short to preview)';
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

/** Routes / Directions key preview; notes when falling back to the main Maps key. */
export function googleMapsRoutesKeyPreview(): string {
  const explicit = routesKeyFromExtra() || legacyRoutesPublic;
  const effective = googleMapsRoutesApiKey();
  if (!effective) return 'Not set — add GOOGLE_MAPS_API_KEY (or GOOGLE_MAPS_ROUTES_API_KEY) to .env';
  if (!explicit) return `${effective.slice(0, 8)}…${effective.slice(-4)} (same as Maps key)`;
  if (effective.length <= 12) return '•••••••• (too short to preview)';
  return `${effective.slice(0, 8)}…${effective.slice(-4)}`;
}

/** Android Google Maps tiles need an API key. iOS uses Apple MapKit without any key. */
export function androidHasGoogleMapsKey(): boolean {
  return Boolean(androidSpecific || googleMapsJavascriptApiKey());
}

/**
 * Web uses an interactive map when any Maps key is set (loads Maps JavaScript API).
 * Android without a Maps key uses list view.
 */
export function shouldShowMapListInsteadOfMap(): boolean {
  if (Platform.OS === 'web') return !isGoogleMapsConfigured();
  if (Platform.OS === 'android' && !androidHasGoogleMapsKey()) return true;
  return false;
}
