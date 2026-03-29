import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/Brand';
import {
  clearRoutingLog,
  subscribeRoutingLog,
  type RoutingLogEntry,
} from '@/lib/routingLog';

type Props = {
  textColor: string;
  mutedColor: string;
  panelBg: string;
  borderColor: string;
};

function formatEntry(e: RoutingLogEntry): string {
  const base = `${e.ts} [${e.phase}] ${e.message}`;
  if (!e.data || Object.keys(e.data).length === 0) return base;
  try {
    return `${base}\n${JSON.stringify(e.data)}`;
  } catch {
    return base;
  }
}

export function RoutingLogViewer({ textColor, mutedColor, panelBg, borderColor }: Props) {
  const [entries, setEntries] = useState<RoutingLogEntry[]>([]);

  useEffect(() => subscribeRoutingLog(setEntries), []);

  return (
    <View>
      <View style={styles.row}>
        <Text style={[styles.hint, { color: mutedColor }]}>
          Transit / directions attempts on this device (works in production builds).
        </Text>
        <Pressable
          onPress={() => clearRoutingLog()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear routing log">
          <Text style={styles.clearTxt}>Clear</Text>
        </Pressable>
      </View>
      <ScrollView
        style={[styles.logBox, { backgroundColor: panelBg, borderColor }]}
        nestedScrollEnabled
        showsVerticalScrollIndicator>
        {entries.length === 0 ? (
          <Text style={[styles.empty, { color: mutedColor }]}>
            No entries yet. Open the Map tab and plan a route to see logs here.
          </Text>
        ) : (
          [...entries]
            .reverse()
            .map((e, i) => (
              <Text
                key={`${e.ts}-${i}-${e.phase}`}
                style={[styles.line, { color: textColor }]}
                selectable>
                {formatEntry(e)}
              </Text>
            ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  hint: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  clearTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.metroTeal,
  },
  logBox: {
    maxHeight: 240,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  empty: {
    fontSize: 12,
    lineHeight: 18,
  },
  line: {
    fontSize: 10,
    lineHeight: 15,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
});
