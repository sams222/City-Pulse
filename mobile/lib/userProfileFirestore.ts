import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { displayUsernameFromEmail } from '@/lib/authUsername';
import { getDb } from '@/lib/firebase';

export const PREFERENCE_OPTIONS = [
  'sports',
  'music',
  'arts',
  'food',
  'community',
  'outdoor',
] as const;

export type PreferenceId = (typeof PREFERENCE_OPTIONS)[number];

export type UserProfileDoc = {
  username: string;
  preferences: string[];
  onboardingComplete: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export async function fetchUserProfile(uid: string): Promise<UserProfileDoc | null> {
  const snap = await getDoc(doc(getDb(), 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    username: typeof d.username === 'string' ? d.username : '',
    preferences: Array.isArray(d.preferences) ? d.preferences.filter((x) => typeof x === 'string') : [],
    onboardingComplete: Boolean(d.onboardingComplete),
  };
}

export async function createUserProfile(uid: string, username: string): Promise<void> {
  await setDoc(doc(getDb(), 'users', uid), {
    username,
    preferences: [],
    onboardingComplete: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** First Google (or other OAuth) sign-in: create a minimal users/{uid} doc if missing. */
export async function ensureUserProfileFromAuth(
  uid: string,
  email: string | null | undefined,
  displayName: string | null | undefined,
): Promise<void> {
  const ref = doc(getDb(), 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const raw = (displayName || email?.split('@')[0] || 'user').toLowerCase();
  const username = raw.replace(/[^a-z0-9_]/g, '').slice(0, 32) || 'user';
  await setDoc(ref, {
    username,
    preferences: [],
    onboardingComplete: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveUserPreferencesMerged(
  uid: string,
  email: string | null | undefined,
  preferences: string[],
): Promise<void> {
  const username = displayUsernameFromEmail(email ?? '') || 'user';
  await setDoc(
    doc(getDb(), 'users', uid),
    {
      username,
      preferences,
      onboardingComplete: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
