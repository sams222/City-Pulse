import { StatusBar } from 'expo-status-bar';
import { Linking, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { Text as ThemedText, View } from '@/components/Themed';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>CityPulse</ThemedText>
      <ThemedText style={styles.body}>
        NYC transit safety and community signals in one map and feed. Data comes from Firestore
        collections seeded from NYC Open Data, MTA-style alerts, and community posts.
      </ThemedText>
      <Pressable
        onPress={() =>
          void Linking.openURL('https://docs.expo.dev/deploy/submit-to-app-stores/')
        }
        style={styles.linkBtn}>
        <ThemedText style={styles.link}>Publishing guide</ThemedText>
      </Pressable>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  linkBtn: { alignSelf: 'flex-start' },
  link: { fontSize: 16, fontWeight: '600', color: '#14b8a6' },
});
