import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthScreenLayout } from '@/components/auth/AuthScreenLayout';
import Colors from '@/constants/Colors';
import { Brand } from '@/constants/Brand';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/contexts/AuthContext';
import {
  PREFERENCE_OPTIONS,
  type PreferenceId,
  saveUserPreferencesMerged,
} from '@/lib/userProfileFirestore';

const LABELS: Record<PreferenceId, string> = {
  sports: 'Sports',
  music: 'Music',
  arts: 'Arts',
  food: 'Food',
  community: 'Community',
  outdoor: 'Outdoor',
};

export default function PreferencesScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const tint = Colors[colorScheme].tint;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prefs = profile?.preferences ?? [];
    const valid = prefs.filter((p): p is PreferenceId =>
      (PREFERENCE_OPTIONS as readonly string[]).includes(p),
    );
    if (valid.length > 0) {
      setSelected(new Set(valid));
    }
  }, [profile?.preferences]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: PreferenceId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onDone = async () => {
    if (!user) return;
    if (selected.size === 0) {
      setError('Pick at least one interest.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await saveUserPreferencesMerged(user.uid, user.email, Array.from(selected));
      await refreshProfile();
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const isWeb = Platform.OS === 'web';
  const titleColor =
    isWeb && colorScheme === 'light' ? '#0a0a0a' : isWeb ? Brand.textPrimary : Colors[colorScheme].text;
  const subColor =
    isWeb && colorScheme === 'light' ? '#525252' : isWeb ? Brand.textSecondary : Colors[colorScheme].text;
  const chipBorder = (on: boolean) =>
    on ? tint : isWeb && colorScheme === 'light' ? '#e5e5e5' : isWeb ? Brand.borderSubtle : colorScheme === 'dark' ? '#475569' : '#cbd5e1';
  const chipBg = (on: boolean) =>
    on
      ? `${tint}33`
      : isWeb && colorScheme === 'light'
        ? '#fafafa'
        : isWeb
          ? Brand.background
          : colorScheme === 'dark'
            ? '#1e293b'
            : '#f8fafc';

  const body = (
    <>
      <Text style={[styles.title, { color: titleColor }]}>What are you interested in?</Text>
      <Text style={[styles.sub, { color: subColor }]}>
        We use this to recommend events on the Feed and map.
      </Text>
      <View style={styles.grid}>
        {PREFERENCE_OPTIONS.map((id) => {
          const on = selected.has(id);
          return (
            <Pressable
              key={id}
              onPress={() => toggle(id)}
              style={[
                styles.chip,
                {
                  borderColor: chipBorder(on),
                  backgroundColor: chipBg(on),
                },
              ]}>
              <Text style={[styles.chipText, { color: titleColor }]}>{LABELS[id]}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <Pressable
        style={[styles.btn, { backgroundColor: tint, opacity: busy ? 0.7 : 1 }]}
        onPress={() => void onDone()}
        disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Finish & go to map</Text>}
      </Pressable>
    </>
  );

  if (isWeb) {
    return (
      <AuthScreenLayout>
        <View
          style={[
            styles.webCard,
            colorScheme === 'light' ? styles.webCardLight : styles.webCardDark,
          ]}>
          {body}
        </View>
      </AuthScreenLayout>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: Colors[colorScheme].background }]}
      contentContainerStyle={styles.content}>
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  webCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
  },
  webCardLight: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e5e5',
  },
  webCardDark: {
    backgroundColor: Brand.surface,
    borderColor: Brand.borderSubtle,
  },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 15, lineHeight: 22, marginBottom: 20, opacity: 0.9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 2,
  },
  chipText: { fontSize: 16, fontWeight: '600' },
  err: { color: '#f87171', marginBottom: 12 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
