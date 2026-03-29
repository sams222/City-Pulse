import type { Persistence } from 'firebase/auth';
import type { AsyncStorageStatic } from '@react-native-async-storage/async-storage';

/**
 * Wraps AsyncStorage persistence for Firebase Auth on React Native.
 * Uses the RN build of `@firebase/auth` (resolved by Metro); typings omit this export on web.
 */
export function getReactNativePersistenceForAuth(storage: AsyncStorageStatic): Persistence {
  const mod = require('@firebase/auth') as {
    getReactNativePersistence: (s: AsyncStorageStatic) => Persistence;
  };
  return mod.getReactNativePersistence(storage);
}
