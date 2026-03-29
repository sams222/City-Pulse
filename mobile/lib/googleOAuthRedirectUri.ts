import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * In Expo Go, the default OAuth redirect is an unstable `exp://…` URL. Google rejects it with HTTP 400
 * unless every possible URI is allow-listed. The Auth Session proxy uses a single stable URL per project.
 *
 * Add this exact URI in Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Web client →
 * Authorized redirect URIs. Use your real Expo username if you use `expo whoami` (not @anonymous/… when possible).
 */
export function getGoogleOAuthRedirectUriForExpoGo(): string | undefined {
  if (Platform.OS === 'web') {
    return undefined;
  }
  if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
    return undefined;
  }
  const fullName = Constants.expoConfig?.originalFullName;
  if (!fullName) {
    return undefined;
  }
  return `https://auth.expo.io/${fullName}`;
}
