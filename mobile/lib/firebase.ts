import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getReactNativePersistenceForAuth } from '@/lib/firebaseAuthPersistence';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_* to mobile/.env');
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_* to mobile/.env');
  }
  const firebaseApp = getFirebaseApp();
  if (!authInstance) {
    if (Platform.OS === 'web') {
      authInstance = getAuth(firebaseApp);
    } else {
      try {
        authInstance = initializeAuth(firebaseApp, {
          persistence: getReactNativePersistenceForAuth(AsyncStorage),
        });
      } catch {
        authInstance = getAuth(firebaseApp);
      }
    }
  }
  return authInstance;
}

export function getDb() {
  return getFirestore(getFirebaseApp());
}
