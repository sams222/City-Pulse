import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { markerColor, useMapPinsState } from '@/hooks/useMapPinsState';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  androidHasGoogleMapsKey,
  shouldShowMapListInsteadOfMap,
} from '@/lib/mapsEnv';

const NYC = { latitude: 40.7128, longitude: -74.006, latitudeDelta: 0.12, longitudeDelta: 0.12 };

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const insets = useSafeAreaInsets();
  const { pins, loading, error, load } = useMapPinsState();
  const mapRef = useRef<MapView>(null);
  const mapProvider =
    Platform.OS === 'android' && androidHasGoogleMapsKey() ? PROVIDER_GOOGLE : undefined;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        500,
      );
    })();
  }, []);

  if (!isFirebaseConfigured()) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={tint} />
        <Text style={[styles.message, { color: Colors[colorScheme].text }]}>
          Firebase is not configured. Copy mobile/.env.example to mobile/.env and add your web app keys.
        </Text>
      </View>
    );
  }

  if (loading && pins.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={tint} />
        <Text style={[styles.hint, { color: Colors[colorScheme].text }]}>Loading Firestore…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[styles.message, { color: '#f87171' }]}>{error}</Text>
        <Text style={[styles.retry, { color: tint }]} onPress={() => void load()}>
          Tap to retry
        </Text>
      </View>
    );
  }

  if (shouldShowMapListInsteadOfMap()) {
    const hint =
      Platform.OS === 'android'
        ? 'Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (or EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY) to mobile/.env, restart Expo, then rebuild if needed for a full map.'
        : 'On phones, open this app in Expo Go or a dev build — iOS shows Apple Maps; Android needs a Google Maps API key for tiles.';
    return (
      <ScrollView contentContainerStyle={styles.webBox}>
        <Text style={[styles.webTitle, { color: Colors[colorScheme].text }]}>
          {Platform.OS === 'web' ? 'Map (web)' : 'Map (list view)'}
        </Text>
        <Text style={[styles.message, { color: Colors[colorScheme].text }]}>{hint}</Text>
        <Text style={[styles.message, { color: Colors[colorScheme].text, marginTop: 8 }]}>
          Pins from Firestore:
        </Text>
        {pins.map((p) => (
          <View key={`${p.kind}-${p.id}`} style={styles.webRow}>
            <View style={[styles.dot, { backgroundColor: markerColor(p.kind) }]} />
            <Text style={{ color: Colors[colorScheme].text }}>
              <Text style={styles.bold}>{p.kind}</Text> — {p.title}
            </Text>
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.fill}>
      <MapView ref={mapRef} style={styles.fill} provider={mapProvider} initialRegion={NYC}>
        {pins.map((p) => (
          <Marker
            key={`${p.kind}-${p.id}`}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.title}
            description={p.description}
            pinColor={markerColor(p.kind)}
          />
        ))}
      </MapView>
      <View
        style={[
          styles.legend,
          {
            backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#fff',
            bottom: 24 + insets.bottom,
          },
        ]}>
        <Text style={[styles.legendItem, { color: markerColor('event') }]}>● Events</Text>
        <Text style={[styles.legendItem, { color: markerColor('community') }]}>● Community</Text>
        <Text style={[styles.legendItem, { color: markerColor('incident') }]}>● Safety</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { marginTop: 16, textAlign: 'center', fontSize: 16, lineHeight: 22 },
  hint: { marginTop: 12 },
  retry: { marginTop: 20, fontSize: 16, fontWeight: '600' },
  legend: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  legendItem: { fontSize: 12, fontWeight: '600' },
  webBox: { padding: 20 },
  webTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  webRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bold: { fontWeight: '700' },
});
