import React from 'react';
import { Tabs, useSegments } from 'expo-router';
import { View } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';

import { CityPulseTabBar } from '@/components/navigation/CityPulseTabBar';
import { useColorScheme } from '@/components/useColorScheme';
import { CITY_PULSE_PRIMARY } from '@/constants/cityPulseNav';
import { NeighborFavorStatusBar } from '@/components/NeighborFavorStatusBar';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

const cityPulsePaperThemeDark = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: CITY_PULSE_PRIMARY,
    background: '#000000',
    surface: '#141418',
    surfaceVariant: '#1c1c22',
  },
};

const cityPulsePaperThemeLight = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: CITY_PULSE_PRIMARY,
    background: '#ffffff',
    surface: '#ffffff',
    surfaceVariant: '#f4f4f5',
    onSurface: '#000000',
    onBackground: '#000000',
  },
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const segments = useSegments();
  const neighborFavorOnMapTab = (segments as string[]).includes('index');

  return (
    <PaperProvider theme={isDark ? cityPulsePaperThemeDark : cityPulsePaperThemeLight}>
      <View style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#ffffff' }}>
        {neighborFavorOnMapTab ? <NeighborFavorStatusBar /> : null}
        <View style={{ flex: 1 }}>
          <Tabs
            tabBar={(props) => <CityPulseTabBar {...props} />}
            screenOptions={{
              headerShown: useClientOnlyValue(false, true),
              tabBarStyle: {
                position: 'absolute',
                backgroundColor: 'transparent',
                borderTopWidth: 0,
                elevation: 0,
                height: 0,
              },
            }}>
            <Tabs.Screen name="index" options={{ title: 'Map' }} />
            <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
            <Tabs.Screen name="quests" options={{ title: 'Quests' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
          </Tabs>
        </View>
      </View>
    </PaperProvider>
  );
}
