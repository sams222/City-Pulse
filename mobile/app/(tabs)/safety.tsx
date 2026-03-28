import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchIncidents, type IncidentRow } from '@/lib/firestoreFeed';
import { isFirebaseConfigured } from '@/lib/firebase';

function formatTime(ms: number) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

export default function SafetyScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setError('Configure Firebase in mobile/.env');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIncidents(50);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isFirebaseConfigured()) {
    return (
      <View style={styles.center}>
        <Text style={{ color: Colors[colorScheme].text, textAlign: 'center' }}>
          Add EXPO_PUBLIC_FIREBASE_* variables to mobile/.env
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: Colors[colorScheme].background }]}>
      <Text style={[styles.header, { color: Colors[colorScheme].text }]}>Safety log</Text>
      <Text style={[styles.subheader, { color: Colors[colorScheme].text }]}>
        Normalized incidents from Firestore (NYPD, Open Data, user reports)
      </Text>
      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tint} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: Colors[colorScheme].text }]}>
              {error ?? 'No incidents. Seed the database from the City-Pulse repo.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#fff7f7',
                  borderColor: colorScheme === 'dark' ? '#7f1d1d' : '#fecaca',
                },
              ]}>
              <Text style={styles.type}>{item.type}</Text>
              <Text style={[styles.meta, { color: Colors[colorScheme].text }]}>
                {formatTime(item.timestamp)}
                {item.source ? ` · ${item.source}` : ''}
              </Text>
              {item.description ? (
                <Text style={[styles.desc, { color: Colors[colorScheme].text }]} numberOfLines={4}>
                  {item.description}
                </Text>
              ) : null}
            </View>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { fontSize: 26, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16 },
  subheader: { fontSize: 14, paddingHorizontal: 16, marginTop: 6, opacity: 0.8 },
  list: { padding: 16 },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  type: { fontSize: 16, fontWeight: '700', color: '#b91c1c' },
  meta: { fontSize: 12, marginTop: 4, opacity: 0.85 },
  desc: { fontSize: 14, marginTop: 8 },
  empty: { textAlign: 'center', marginTop: 32, paddingHorizontal: 20 },
});
