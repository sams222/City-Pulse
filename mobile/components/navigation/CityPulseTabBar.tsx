import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import {
  CITY_PULSE_MUTED,
  CITY_PULSE_PRIMARY,
  CITY_PULSE_TAB_NAV,
  TAB_BAR_INNER_HEIGHT,
  TAB_PILL_BOTTOM,
} from '@/constants/cityPulseNav';

/** Light theme: dark type for readability on white bar. */
const INACTIVE_LIGHT = '#262626';

export function CityPulseTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8) + TAB_PILL_BOTTOM;

  const enterY = useRef(new Animated.Value(0)).current;
  const tabScales = useRef(CITY_PULSE_TAB_NAV.map(() => new Animated.Value(1))).current;
  const pressOpacity = useRef(CITY_PULSE_TAB_NAV.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    CITY_PULSE_TAB_NAV.forEach((item, i) => {
      const focused = state.routes[state.index]?.name === item.routeName;
      Animated.spring(tabScales[i], {
        toValue: focused ? 1.06 : 1,
        useNativeDriver: true,
        friction: 7,
        tension: 80,
      }).start();
    });
  }, [state.index, state.routes, tabScales]);

  const barBg = isDark ? '#000000' : '#ffffff';
  const barBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)';
  const inactiveLabel = isDark ? CITY_PULSE_MUTED : INACTIVE_LIGHT;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.shell, { bottom }, { transform: [{ translateY: enterY }] }]}>
      <View
        style={[
          styles.blur,
          { backgroundColor: barBg, borderColor: barBorder },
          Platform.OS === 'web' && styles.blurWeb,
        ]}>
        <View style={styles.inner}>
          {CITY_PULSE_TAB_NAV.map((item, i) => {
            const route = state.routes.find((r) => r.name === item.routeName);
            if (!route) return null;
            const focused = state.routes[state.index]?.name === route.name;
            const { options } = descriptors[route.key];
            const scale = tabScales[i];

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            const fadePress = (to: number) => {
              Animated.timing(pressOpacity[i], {
                toValue: to,
                duration: 90,
                useNativeDriver: true,
              }).start();
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                onPressIn={() => fadePress(0.72)}
                onPressOut={() => fadePress(1)}
                style={styles.hit}>
                <Animated.View style={{ opacity: pressOpacity[i], transform: [{ scale }] }}>
                  <View style={[styles.pill, focused && styles.pillActive]}>
                    <Text
                      style={[styles.label, focused ? styles.labelActive : { color: inactiveLabel }]}
                      numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'stretch',
  },
  blur: {
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  blurWeb: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TAB_BAR_INNER_HEIGHT,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
  },
  hit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '25%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  pillActive: {
    backgroundColor: CITY_PULSE_PRIMARY,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
  labelActive: {
    color: '#000000',
  },
});
