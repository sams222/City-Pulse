import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { getFirebaseAuth } from '@/lib/firebase';
import {
  getGoogleAndroidClientId,
  getGoogleIosClientId,
  getGoogleWebClientId,
} from '@/lib/googleOAuthEnv';
import { getGoogleOAuthRedirectUriForExpoGo } from '@/lib/googleOAuthRedirectUri';
import { signInWithGoogleWeb } from '@/lib/signInWithGoogle';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  label?: string;
  onError?: (message: string) => void;
};

function friendlyAuthError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('auth/popup-closed-by-user')) return 'Sign-in was cancelled.';
  if (msg.includes('auth/popup-blocked')) return 'Allow pop-ups for this site, then try again.';
  if (msg.includes('auth/unauthorized-domain')) return 'This domain is not authorized in Firebase Auth.';
  if (msg.includes('auth/operation-not-allowed')) return 'Enable Google sign-in in Firebase Console.';
  return msg.length > 120 ? 'Google sign-in failed.' : msg;
}

function friendlyGoogleOAuthParamError(params: Record<string, string>): string | null {
  const err = (params.error ?? '').toLowerCase();
  const desc = (params.error_description ?? '').toLowerCase();
  if (err === 'redirect_uri_mismatch' || desc.includes('redirect_uri')) {
    return 'Google OAuth redirect URI mismatch. In Google Cloud Console → OAuth 2.0 Web client, add Authorized redirect URI: https://auth.expo.io/@YOUR_EXPO_USERNAME/city-pulse (see Expo `expo whoami` and app slug).';
  }
  if (err === 'invalid_request' || desc.includes('400')) {
    return 'Google rejected the sign-in request (often missing or wrong redirect URI in Cloud Console, or wrong OAuth client type). Use the Web client ID from Firebase and add the auth.expo.io redirect URI above.';
  }
  const policyish =
    desc.includes('oauth 2.0 policy') ||
    desc.includes("doesn't comply") ||
    desc.includes('does not comply') ||
    desc.includes('policy for keeping') ||
    desc.includes('verification') ||
    desc.includes('test users') ||
    desc.includes('in testing');
  if (err === 'access_denied' || policyish) {
    return "Google blocked sign-in due to OAuth consent settings (not a bug in the app). In Google Cloud → APIs & Services → OAuth consent screen: set Publishing status, fill App name / support email & developer contact, and if the app is still in Testing add your Google account under Test users. Use the same GCP project as your Firebase app's Web OAuth client.";
  }
  return null;
}

function GoogleSignInWeb({ label, onError }: Props) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  return (
    <Pressable
      style={[styles.btn, { borderColor: tint }]}
      onPress={() =>
        void signInWithGoogleWeb().catch((e) => {
          onError?.(friendlyAuthError(e));
        })
      }>
      <Text style={[styles.btnText, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

function GoogleSignInNative({ label, onError }: Props) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const webClientId = getGoogleWebClientId();
  const iosClientId = getGoogleIosClientId();
  const androidClientId = getGoogleAndroidClientId();
  const expoGoRedirectUri = useMemo(() => getGoogleOAuthRedirectUriForExpoGo(), []);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: webClientId || 'missing.apps.googleusercontent.com',
    iosClientId: iosClientId || undefined,
    androidClientId: androidClientId || undefined,
    ...(expoGoRedirectUri ? { redirectUri: expoGoRedirectUri } : {}),
  });

  useEffect(() => {
    if (response?.type === 'error') {
      const fromParams =
        response.params && typeof response.params === 'object'
          ? friendlyGoogleOAuthParamError(response.params as Record<string, string>)
          : null;
      onError?.(
        fromParams ??
          response.error?.message ??
          (response.params as { error_description?: string } | undefined)?.error_description ??
          'Google sign-in failed.',
      );
      return;
    }
    if (response?.type !== 'success') return;
    const p = response.params ?? {};
    const oauthErr = typeof p.error === 'string' ? p.error : '';
    if (oauthErr) {
      const hint = friendlyGoogleOAuthParamError(p as Record<string, string>);
      onError?.(hint ?? `${oauthErr}: ${(p.error_description as string) ?? 'Google sign-in failed.'}`);
      return;
    }
    const idToken = p.id_token;
    if (!idToken) {
      onError?.('No ID token from Google. Check Web client ID in app config / .env.');
      return;
    }
    const cred = GoogleAuthProvider.credential(idToken);
    void signInWithCredential(getFirebaseAuth(), cred).catch((e) => {
      onError?.(friendlyAuthError(e));
    });
  }, [response, onError]);

  if (!webClientId) {
    return (
      <View style={styles.missingWrap}>
        <Text style={[styles.hint, { color: Colors[colorScheme].text }]}>
          Add GOOGLE_WEB_CLIENT_ID or EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to mobile/.env (Web client ID from Firebase →
          Project settings), then restart Expo so app.config.js can pass it to the app.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        style={[styles.btn, { borderColor: tint, opacity: !request ? 0.5 : 1 }]}
        disabled={!request}
        onPress={() => void promptAsync()}>
        {!request ? (
          <ActivityIndicator color={tint} />
        ) : (
          <Text style={[styles.btnText, { color: tint }]}>{label}</Text>
        )}
      </Pressable>
    </View>
  );
}

export function GoogleSignInButton({ label = 'Continue with Google', onError }: Props) {
  if (Platform.OS === 'web') {
    return <GoogleSignInWeb label={label} onError={onError} />;
  }
  return <GoogleSignInNative label={label} onError={onError} />;
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: { fontSize: 16, fontWeight: '700' },
  missingWrap: { marginTop: 8 },
  hint: { fontSize: 13, lineHeight: 18, opacity: 0.85 },
});
