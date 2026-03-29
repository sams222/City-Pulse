import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { floatingTabBarExtraBottom } from '@/constants/cityPulseNav';

/** Bottom inset so scroll content clears the floating glass tab bar. */
export function useFloatingTabBarPadding(): number {
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    // Web: safe-area often flutters after geo / viewport changes — use a fixed clearance
    // so layer toggles and FABs do not jump when location is resolved.
    if (Platform.OS === 'web') {
      return floatingTabBarExtraBottom(0);
    }
    return floatingTabBarExtraBottom(insets.bottom);
  }, [insets.bottom]);
}
