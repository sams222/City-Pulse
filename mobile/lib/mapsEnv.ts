import Constants from 'expo-constants';
import { Platform } from 'react-native';

type Extra = { googleMapsApiKey?: string };

function keyFromExtra(): string {
  return (Constants.expoConfig?.extra as Extra | undefined)?.googleMapsApiKey?.trim() ?? '';
}

/** Legacy fallbacks if you still use EXPO_PUBLIC_ vars. */
const legacyPublic = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();
const androidSpecific = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '').trim();
const iosSpecific = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ?? '').trim();

const shared = keyFromExtra() || legacyPublic;

export function isGoogleMapsConfigured(): boolean {
  return Boolean(shared || androidSpecific || iosSpecific);
}

/** Shows that a key loaded without exposing the full secret (Profile / debug). */
export function googleMapsKeyPreview(): string {
  const k = shared || androidSpecific || iosSpecific;
  if (!k) return 'Not set — add GOOGLE_MAPS_API_KEY to .env (then restart Expo)';
  if (k.length <= 12) return '•••••••• (too short to preview)';
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

/** Android Google Maps tiles need an API key. iOS uses Apple MapKit without any key. */
export function androidHasGoogleMapsKey(): boolean {
  return Boolean(androidSpecific || shared);
}

/** Web always uses list UI; Android without a Maps key uses list so the app still works. */
export function shouldShowMapListInsteadOfMap(): boolean {
  if (Platform.OS === 'web') return true;
  if (Platform.OS === 'android' && !androidHasGoogleMapsKey()) return true;
  return false;
}
