import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchFeedItems, type FeedItem } from '@/lib/firestoreFeed';
import { isFirebaseConfigured } from '@/lib/firebase';

const badges = {
  event: { label: 'Official', icon: 'calendar-outline' as const, color: '#22c55e' },
  community: { label: 'Community', icon: 'heart-outline' as const, color: '#f97316' },
  incident: { label: 'Safety', icon: 'warning-outline' as const, color: '#ef4444' },
  alert: { label: 'Transit', icon: 'train-outline' as const, color: '#38bdf8' },
} satisfies Record<
  FeedItem['kind'],
  { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }
>;

export default function FeedScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const [items, setItems] = useState<FeedItem[]>([]);
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
      const data = await fetchFeedItems(20);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feed');
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
      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tint} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.kind}-${it.id}`}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListHeaderComponent={
            <Text style={[styles.header, { color: Colors[colorScheme].text }]}>City pulse</Text>
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: Colors[colorScheme].text }]}>
              {error ?? 'No items yet. Run Firestore seed from repo root: npm run seed:firestore'}
            </Text>
          }
          renderItem={({ item }) => {
            const b = badges[item.kind];
            return (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f8fafc',
                    borderColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0',
                  },
                ]}>
                <View style={styles.cardTop}>
                  <Ionicons name={b.icon} size={20} color={b.color} />
                  <Text style={[styles.badge, { color: b.color }]}>{b.label}</Text>
                </View>
                <Text style={[styles.title, { color: Colors[colorScheme].text }]}>{item.title}</Text>
                {item.subtitle ? (
                  <Text style={[styles.sub, { color: Colors[colorScheme].text }]} numberOfLines={3}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
            );
          }}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16, paddingBottom: 32 },
  header: { fontSize: 26, fontWeight: '800', marginBottom: 16 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  badge: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  title: { fontSize: 17, fontWeight: '600' },
  sub: { marginTop: 6, fontSize: 14, opacity: 0.85 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
