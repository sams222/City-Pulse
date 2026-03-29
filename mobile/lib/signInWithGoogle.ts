import { Platform } from 'react-native';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

import { getFirebaseAuth } from '@/lib/firebase';
import { getGoogleWebClientId } from '@/lib/googleOAuthEnv';

/** Firebase Auth + Google provider (enable Google sign-in in Firebase Console). */
export async function signInWithGoogleWeb(): Promise<void> {
  if (Platform.OS !== 'web') {
    throw new Error('signInWithGoogleWeb is web-only');
  }
  const provider = new GoogleAuthProvider();
  await signInWithPopup(getFirebaseAuth(), provider);
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(getGoogleWebClientId());
}
