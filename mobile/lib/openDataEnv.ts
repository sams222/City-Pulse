import Constants from 'expo-constants';

type Extra = { nycOpenDataAppToken?: string };

export function nycOpenDataAppToken(): string {
  const fromExtra = (Constants.expoConfig?.extra as Extra | undefined)?.nycOpenDataAppToken?.trim();
  if (fromExtra) return fromExtra;
  return (process.env.EXPO_PUBLIC_NYC_OPEN_DATA_APP_TOKEN ?? '').trim();
}
