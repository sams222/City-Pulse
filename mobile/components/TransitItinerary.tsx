import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { TransitSegment } from '@/lib/transitDirections';

type Props = {
  segments: TransitSegment[];
  textColor: string;
  subtleColor: string;
  accentColor: string;
};

export function TransitItinerary({ segments, textColor, subtleColor, accentColor }: Props) {
  if (segments.length === 0) {
    return (
      <Text style={[styles.empty, { color: subtleColor }]}>
        Step details are not available for this route.
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      {segments.map((seg, i) => (
        <View
          key={`seg-${i}`}
          style={[
            styles.row,
            i > 0 && styles.rowBorder,
            { borderTopColor: subtleColor },
          ]}>
          {seg.kind === 'walk' ? (
            <>
              <View style={[styles.iconWrap, { backgroundColor: `${accentColor}22` }]}>
                <Ionicons name="walk-outline" size={18} color={accentColor} />
              </View>
              <View style={styles.body}>
                <Text style={[styles.modeTag, { color: accentColor }]}>Walking</Text>
                <Text style={[styles.title, { color: textColor }]} numberOfLines={4}>
                  {seg.summary}
                </Text>
                <Text style={[styles.meta, { color: subtleColor }]}>
                  {[seg.durationText, seg.distanceText].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.iconWrap, { backgroundColor: `${accentColor}22` }]}>
                <Ionicons
                  name={
                    seg.modeLabel === 'Bus'
                      ? 'bus-outline'
                      : seg.modeLabel === 'Ferry'
                        ? 'boat-outline'
                        : 'train-outline'
                  }
                  size={18}
                  color={accentColor}
                />
              </View>
              <View style={styles.body}>
                <Text style={[styles.modeTag, { color: accentColor }]}>
                  {seg.modeLabel} · {seg.vehicleLabel}
                </Text>
                <Text style={[styles.lineName, { color: textColor }]}>
                  Take {seg.lineShortName}
                  {seg.lineName !== seg.lineShortName ? ` — ${seg.lineName}` : ''}
                </Text>
                {seg.headsign ? (
                  <Text style={[styles.headsign, { color: subtleColor }]} numberOfLines={2}>
                    {seg.headsign}
                  </Text>
                ) : null}
                <Text style={[styles.stopLine, { color: textColor }]}>
                  <Text style={styles.stopLabel}>Board </Text>
                  {seg.departureStop}
                </Text>
                <Text style={[styles.stopLine, { color: textColor }]}>
                  <Text style={styles.stopLabel}>Exit </Text>
                  {seg.arrivalStop}
                </Text>
                <Text style={[styles.meta, { color: subtleColor }]}>
                  {seg.numStops > 0
                    ? `${seg.numStops} stop${seg.numStops === 1 ? '' : 's'} on board`
                    : 'Ride segment'}
                  {seg.durationText ? ` · ${seg.durationText}` : ''}
                </Text>
              </View>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  empty: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: { flex: 1, minWidth: 0 },
  modeTag: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontSize: 13, fontWeight: '600', marginTop: 2, lineHeight: 18 },
  lineName: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  headsign: { fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  stopLine: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  stopLabel: { fontWeight: '700', opacity: 0.85 },
  meta: { fontSize: 12, marginTop: 4 },
});
