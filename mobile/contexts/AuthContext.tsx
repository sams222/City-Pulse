import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter, useSegments } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import {
  ensureUserProfileFromAuth,
  fetchUserProfile,
  type UserProfileDoc,
} from '@/lib/userProfileFirestore';

type AuthContextValue = {
  user: User | null;
  profile: UserProfileDoc | null;
  initializing: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  const refreshProfile = useCallback(async () => {
    const u = getFirebaseAuth().currentUser;
    if (!u) {
      setProfile(null);
      return;
    }
    const p = await fetchUserProfile(u.uid);
    setProfile(p);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      setProfile(null);
      setInitializing(false);
      return;
    }
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setInitializing(false);
      if (u) {
        void (async () => {
          let p = await fetchUserProfile(u.uid);
          if (!p) {
            await ensureUserProfileFromAuth(u.uid, u.email, u.displayName);
            p = await fetchUserProfile(u.uid);
          }
          setProfile(p);
        })();
      } else {
        setProfile(null);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (initializing || !isFirebaseConfigured()) return;
    const root = segments[0];
    const inAuth = root === '(auth)';

    if (!user) {
      if (!inAuth) {
        router.replace('/(auth)/login');
      }
      return;
    }

    // Logged in: only block auth screens meant for signed-out users (login/register).
    // Preferences are shown after registration only (register.tsx navigates here); login goes straight to the app.
    if (inAuth) {
      const screen = segments[1];
      if (screen === 'login' || screen === 'register') {
        router.replace('/(tabs)');
      }
    }
  }, [user, initializing, segments, router]);

  const value = useMemo(
    () => ({ user, profile, initializing, refreshProfile }),
    [user, profile, initializing, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
