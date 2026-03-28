import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { isFirebaseConfigured } from '@/lib/firebase';
import { googleMapsKeyPreview } from '@/lib/mapsEnv';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '—';

  return (
    <View style={[styles.fill, { backgroundColor: Colors[colorScheme].background }]}>
      <Text style={[styles.title, { color: Colors[colorScheme].text }]}>Profile</Text>
      <Text style={[styles.p, { color: Colors[colorScheme].text }]}>
        Auth screens can plug in here later. For the hackathon demo this build uses read-only
        Firestore access with env-based Firebase config.
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f1f5f9',
            borderColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0',
          },
        ]}>
        <Row label="Firebase project" value={projectId} dark={colorScheme === 'dark'} />
        <Row
          label="Config"
          value={isFirebaseConfigured() ? 'Loaded' : 'Missing .env'}
          dark={colorScheme === 'dark'}
        />
        <Row label="Google Maps key" value={googleMapsKeyPreview()} dark={colorScheme === 'dark'} />
        <Row label="App version" value={Constants.expoConfig?.version ?? '—'} dark={colorScheme === 'dark'} />
        <Row label="Slug" value={Constants.expoConfig?.slug ?? '—'} dark={colorScheme === 'dark'} />
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  dark,
}: {
  label: string;
  value: string;
  dark: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: dark ? '#94a3b8' : '#64748b' }]}>{label}</Text>
      <Text style={[styles.value, { color: dark ? '#f8fafc' : '#0f172a' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, padding: 20 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 12 },
  p: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  card: { borderRadius: 14, borderWidth: 1, padding: 6 },
  row: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '600', marginTop: 4 },
});
