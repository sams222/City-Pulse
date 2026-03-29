import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { MapTheme } from '@/components/map/mapTypes';
import { PIN_QUEST_AMBER } from '@/lib/mapMarkerLayers';

type Props = {
  bottom: number;
  right: number;
  topInset: number;
  mapTheme: MapTheme;
  tint: string;
  chipBg: string;
  chipText: string;
  hidden: boolean;
  onToggleMapTheme: () => void;
  onPressTransit: () => void;
  onPressQuest: () => void;
};

/** Three offset rectangles — reads as “map layers / basemap”. */
function StackedLayersIcon({ color }: { color: string }) {
  return (
    <View style={styles.layersWrap}>
      <View style={[styles.layerRect, { left: 0, top: 0, opacity: 0.4, backgroundColor: color }]} />
      <View style={[styles.layerRect, { left: 4, top: 5, opacity: 0.72, backgroundColor: color }]} />
      <View style={[styles.layerRect, { left: 8, top: 10, opacity: 1, backgroundColor: color }]} />
    </View>
  );
}

/** Yellow map pin with “Q” — neighborhood quest creator. */
function QuestPinIcon() {
  return (
    <View style={styles.questIconWrap}>
      <Ionicons name="location" size={34} color={PIN_QUEST_AMBER} />
      <View style={styles.questQCircle}>
        <Text style={styles.questQText}>Q</Text>
      </View>
    </View>
  );
}

/** Crosshair + pin — plan a transit route. */
function RouteCompanionIcon() {
  return (
    <View style={styles.routeIconWrap}>
      <Ionicons name="locate" size={26} color="#fff" />
      <View style={styles.routePinBadge}>
        <Ionicons name="pin" size={16} color="#fff" />
      </View>
    </View>
  );
}

export function MapFloatingActions({
  bottom,
  right,
  topInset,
  mapTheme,
  tint,
  chipBg,
  chipText,
  hidden,
  onToggleMapTheme,
  onPressTransit,
  onPressQuest,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const showLabels = winW >= 360;

  if (hidden) return null;

  return (
    <>
      {/* Basemap light/dark — top-right, below status bar */}
      <View style={[styles.column, { top: 12 + topInset, right }]} pointerEvents="box-none">
        <Pressable
          style={[styles.fabCard, { backgroundColor: chipBg }]}
          onPress={onToggleMapTheme}
          accessibilityRole="button"
          accessibilityLabel={`Map basemap: ${mapTheme === 'dark' ? 'dark' : 'light'}. Double tap to switch.`}>
          <StackedLayersIcon color={tint} />
          {showLabels ? (
            <>
              <Text style={[styles.fabLabel, { color: chipText }]} numberOfLines={1}>
                Layers
              </Text>
              <Text style={[styles.fabSub, { color: tint }]} numberOfLines={1}>
                {mapTheme === 'dark' ? 'Dark' : 'Light'}
              </Text>
            </>
          ) : null}
        </Pressable>
      </View>

      {/* Route + Quest — bottom-right column above legend */}
      <View style={[styles.column, { bottom, right }]} pointerEvents="box-none">
        <Pressable
          style={[styles.fabCard, styles.fabPrimary, { backgroundColor: tint }]}
          onPress={onPressTransit}
          accessibilityRole="button"
          accessibilityLabel="Plan transit route. Tap the map to choose a destination.">
          <RouteCompanionIcon />
          {showLabels ? (
            <Text style={[styles.fabLabel, styles.fabLabelOnPrimary]} numberOfLines={1}>
              Route
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          style={[styles.fabCard, styles.fabPrimary, { backgroundColor: '#92400e', marginTop: 10 }]}
          onPress={onPressQuest}
          accessibilityRole="button"
          accessibilityLabel="Create a quest. Tap the map to drop a quest pin.">
          <QuestPinIcon />
          {showLabels ? (
            <Text style={[styles.fabLabel, styles.fabLabelOnPrimary]} numberOfLines={1}>
              Quest
            </Text>
          ) : null}
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  column: {
    position: 'absolute',
    zIndex: 14,
    alignItems: 'flex-end',
  },
  fabCard: {
    minWidth: 58,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPrimary: {
    minWidth: 62,
    paddingVertical: 10,
  },
  layersWrap: {
    width: 30,
    height: 22,
    marginBottom: 2,
  },
  layerRect: {
    position: 'absolute',
    width: 22,
    height: 7,
    borderRadius: 2,
  },
  fabLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    maxWidth: 72,
    textAlign: 'center',
  },
  fabSub: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  fabLabelOnPrimary: {
    color: '#fff',
    marginTop: 2,
  },
  routeIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routePinBadge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
    padding: 1,
  },
  questIconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questQCircle: {
    position: 'absolute',
    top: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PIN_QUEST_AMBER,
  },
  questQText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: -1,
  },
});
