import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  enrichMapEventWithGemini,
  type GeminiEventEnrichmentResult,
} from '@/lib/geminiEventEnrichment';
import { getGeminiApiKey } from '@/lib/geminiEnv';
import type { EventDetail } from '@/lib/firestoreFeed';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; data: GeminiEventEnrichmentResult }
  | { status: 'error'; message: string };

type Props = {
  event: EventDetail;
  tint: string;
  textColor: string;
  subtleColor: string;
  /** Shown above the summary (map vs feed copy). */
  context?: 'map' | 'feed';
};

/**
 * Web search + summary + images for one Firestore event (shared by Map pin modal and Feed event modal).
 */
export function GeminiEventInsights({ event, tint, textColor, subtleColor, context = 'map' }: Props) {
  const [state, setState] = useState<State>(() =>
    getGeminiApiKey() ? { status: 'loading' } : { status: 'idle' },
  );

  useEffect(() => {
    if (!getGeminiApiKey()) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    void enrichMapEventWithGemini(event).then(
      (data) => {
        if (!cancelled) setState({ status: 'done', data });
      },
      (e: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: e instanceof Error ? e.message : 'Could not load AI summary',
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  if (!getGeminiApiKey()) {
    return (
      <Text style={[styles.hint, { color: subtleColor }]}>
        Add GEMINI_API_KEY to mobile/.env, then restart Expo (app.config puts it in the app bundle). Used for a
        web-grounded summary and images (Gemini + Google Search).
      </Text>
    );
  }

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <View style={styles.row}>
        <ActivityIndicator color={tint} size="small" />
        <Text style={[styles.hint, { color: subtleColor, flex: 1 }]}>
          {context === 'feed'
            ? 'Looking up this event on the web…'
            : 'Searching the web for this event (Gemini)…'}
        </Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return <Text style={[styles.err, { color: '#f87171' }]}>{state.message}</Text>;
  }

  const { data } = state;
  return (
    <ScrollView
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}>
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: textColor }]}>Web insights (Gemini)</Text>
        <Text style={[styles.body, { color: textColor }]}>{data.summary}</Text>
        {data.imageUrls.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.strip}
            contentContainerStyle={styles.stripInner}>
            {data.imageUrls.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.thumb} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.hint, { color: subtleColor }]}>
            No direct image links found in search results for this event.
          </Text>
        )}
        {data.sources.length > 0 ? (
          <View style={styles.sources}>
            <Text style={[styles.sourcesTitle, { color: subtleColor }]}>Sources</Text>
            {data.sources.slice(0, 6).map((s) => (
              <Pressable key={s.url} onPress={() => void Linking.openURL(s.url)}>
                <Text style={[styles.sourceLink, { color: tint }]} numberOfLines={2}>
                  {s.title}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  scrollContent: { paddingBottom: 8 },
  wrap: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  title: { fontWeight: '700', fontSize: 14 },
  body: { marginTop: 8, fontSize: 15, lineHeight: 22 },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  err: { fontSize: 13, marginTop: 8 },
  strip: { marginTop: 12 },
  stripInner: { paddingRight: 8 },
  thumb: {
    width: 200,
    height: 120,
    borderRadius: 10,
    backgroundColor: '#334155',
    marginRight: 10,
  },
  sources: { marginTop: 12, gap: 6 },
  sourcesTitle: { fontWeight: '600', fontSize: 12 },
  sourceLink: { fontSize: 13 },
});
