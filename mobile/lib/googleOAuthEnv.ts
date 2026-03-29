import Constants from 'expo-constants';

type Extra = {
  googleWebClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

/** Web client ID from Firebase / Google Cloud — required for native Google sign-in. */
export function getGoogleWebClientId(): string {
  return (
    extra().googleWebClientId ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.GOOGLE_WEB_CLIENT_ID ||
    ''
  ).trim();
}

export function getGoogleIosClientId(): string {
  return (
    extra().googleIosClientId || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || ''
  ).trim();
}

export function getGoogleAndroidClientId(): string {
  return (
    extra().googleAndroidClientId || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || ''
  ).trim();
}
