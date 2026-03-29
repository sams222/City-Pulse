import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  Card,
  Icon,
  List,
  MD3DarkTheme,
  PaperProvider,
  Text,
} from 'react-native-paper';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapCanvas } from './MapCanvas';
import { MAP_CENTER, MAP_MARKERS, USER_MARKER } from './mapMarkers';
import { CAT_COLOR, type MarkerType } from './mapCanvasShared';

type TabKey = 'map' | 'feed' | 'quests' | 'profile';
type AppPhase = 'intro' | 'pulsing' | 'revealed';

const COLORS = {
  overlay: 'rgba(0, 0, 0, 0.75)',
  card: 'rgba(20, 20, 25, 0.85)',
  border: 'rgba(255, 255, 255, 0.06)',
  text: '#FFFFFF',
  textMuted: '#71717A',
  timeBadgeBg: 'rgba(255, 255, 255, 0.1)',
  timeBadgeText: '#A1A1AA',
  primary: '#10B981',
  safety: '#F43F5E',
  warning: '#F59E0B',
  community: '#22C55E',
  live: '#F97316',
  pillBg: 'rgba(12, 12, 14, 0.88)',
};

const TAB_BAR_H = 56;
const TAB_PILL_BOTTOM = 16;

const cityPulseTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: COLORS.primary,
    secondary: COLORS.safety,
    background: '#000000',
    surface: '#141418',
    surfaceVariant: '#1c1c22',
    outline: COLORS.border,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={cityPulseTheme}>
        <View style={styles.appRoot}>
          <StatusBar style="light" />
          <AppShell />
        </View>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const [tab, setTab] = useState<TabKey>('map');
  const [phase, setPhase] = useState<AppPhase>('intro');

  // Starts off-screen below, springs up when revealed
  const navSlideAnim = useRef(new Animated.Value(140)).current;

  function handleReveal() {
    setPhase('revealed');
    Animated.spring(navSlideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 5,
      speed: 10,
    }).start();
  }

  return (
    <View style={styles.webCenterer}>
      <View style={[styles.mobileFrame, tab === 'map' && styles.mobileFrameMap]}>
        <View style={styles.screen} collapsable={false}>
          {tab === 'map' ? <MapScreen phase={phase} onReveal={handleReveal} /> : null}
          {tab === 'feed' ? <FeedScreen /> : null}
          {tab === 'quests' ? <QuestsScreen /> : null}
          {tab === 'profile' ? <ProfileScreen /> : null}
        </View>
        <Animated.View
          style={{ transform: [{ translateY: navSlideAnim }] }}
          pointerEvents={phase === 'revealed' ? 'box-none' : 'none'}>
          <BottomNav tab={tab} onChange={setTab} />
        </Animated.View>
      </View>
    </View>
  );
}

const ALL_CATEGORIES: { key: MarkerType; label: string }[] = [
  { key: 'safety', label: 'Safety events' },
  { key: 'community', label: 'Community events' },
  { key: 'bathroom', label: 'Bathrooms' },
];

function MapScreen({ phase, onReveal }: { phase: AppPhase; onReveal: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: WIN_W, height: WIN_H } = Dimensions.get('window');
  const fabBottom = insets.bottom + TAB_BAR_H + TAB_PILL_BOTTOM + 16;

  // ── Category filter ────────────────────────────────────────────────────────
  const [activeCats, setActiveCats] = useState<Set<MarkerType>>(
    new Set(['safety', 'community', 'bathroom']),
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropAnim = useRef(new Animated.Value(0)).current;

  function toggleDropdown() {
    const opening = !dropdownOpen;
    setDropdownOpen(opening);
    Animated.spring(dropAnim, {
      toValue: opening ? 1 : 0,
      useNativeDriver: true,
      bounciness: 3,
      speed: 18,
    }).start();
  }

  function toggleCat(cat: MarkerType) {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  // ── Intro animation state ──────────────────────────────────────────────────
  const [revealedIds, setRevealedIds]           = useState<Set<string>>(new Set());
  const [markersFullyRevealed, setMarkersFullyRevealed] = useState(false);
  const revealTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pulsedRef = useRef(false);

  // Pulse button
  const pulseButtonOpacity = useRef(new Animated.Value(1)).current;
  const pulseButtonScale   = useRef(new Animated.Value(1)).current;

  // Idle breathe on the Pulse button to draw attention
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseButtonScale, { toValue: 1.06, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(pulseButtonScale, { toValue: 1,    duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseButtonScale]);

  // Clean up reveal timeouts on unmount
  useEffect(() => () => { revealTimeoutsRef.current.forEach(clearTimeout); }, []);

  // Single wave ring.
  // Use a large base element (600 px) so the border stays visually thin at any
  // scale — e.g. at max scale ~3.7× the border appears ~7 px wide.
  // Scale starts at 0.01 so the ring appears to emerge from the user pin.
  const WAVE_BASE     = 600;
  const WAVE_DURATION = 11000; // ms — slow and deliberate
  const waveMaxScale  = (Math.hypot(WIN_W, WIN_H) * 2.4) / WAVE_BASE;

  const waveScale   = useRef(new Animated.Value(0.01)).current;
  const waveOpacity = useRef(new Animated.Value(0)).current;

  function fireWaveRing() {
    waveOpacity.setValue(0.9);
    waveScale.setValue(0.01);
    Animated.parallel([
      Animated.timing(waveScale,   { toValue: waveMaxScale, duration: WAVE_DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(waveOpacity, { toValue: 0,            duration: WAVE_DURATION, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }

  // Top UI slides down from above the screen
  const topUiSlide = useRef(new Animated.Value(-200)).current;
  // FABs slide in from the right
  const fabsSlide  = useRef(new Animated.Value(100)).current;

  function handlePulse() {
    if (pulsedRef.current) return;
    pulsedRef.current = true;

    // 1. Dismiss the Pulse button
    Animated.parallel([
      Animated.timing(pulseButtonOpacity, { toValue: 0,   duration: 250, useNativeDriver: true }),
      Animated.timing(pulseButtonScale,   { toValue: 0.8, duration: 250, useNativeDriver: true }),
    ]).start();

    // 2. Fire the single wave ring
    fireWaveRing();

    // 3. Stagger-reveal each marker as the wave reaches its screen position.
    //    We use a linear distance→time mapping against the wave's leading edge.
    //    maxRadius = half the wave's final diameter (ring is centred on user pin).
    const maxRadius = Math.hypot(WIN_W, WIN_H) * 1.2;

    const markersToReveal = MAP_MARKERS.filter((m) =>
      activeCats.has(m.type as MarkerType),
    );

    revealTimeoutsRef.current.forEach(clearTimeout);
    revealTimeoutsRef.current = [];

    // Track the latest marker delay so we know when to reveal the UI
    let maxMarkerDelay = 0;

    markersToReveal.forEach((marker) => {
      // Convert lat/lon offset to approximate screen-space pixels
      const dx = (marker.longitude - MAP_CENTER.longitude) * WIN_W / MAP_CENTER.longitudeDelta;
      const dy = (MAP_CENTER.latitude - marker.latitude)   * WIN_H / MAP_CENTER.latitudeDelta;
      const dist = Math.hypot(dx, dy);

      // Invert Easing.out(Easing.quad): f(t) = 1-(1-t)^2  →  t = 1-√(1-ratio)
      // This gives the exact time the wave front reaches this marker's position.
      const ratio = Math.min(dist / maxRadius, 0.99);
      const delay = Math.max(0, Math.round(WAVE_DURATION * (1 - Math.sqrt(1 - ratio))) - 80);

      if (delay > maxMarkerDelay) maxMarkerDelay = delay;

      const t = setTimeout(() => {
        setRevealedIds((prev) => new Set([...prev, marker.id]));
      }, delay);
      revealTimeoutsRef.current.push(t);
    });

    // Switch to normal filter-based markers after the last reveal settles
    const fullReveal = setTimeout(() => setMarkersFullyRevealed(true), maxMarkerDelay + 400);
    revealTimeoutsRef.current.push(fullReveal);

    // 4. Slide in top chrome, FABs and nav shortly after the last marker pops in
    const uiReveal = setTimeout(() => {
      Animated.spring(topUiSlide, { toValue: 0, useNativeDriver: true, bounciness: 7, speed: 11 }).start();
      setTimeout(() =>
        Animated.spring(fabsSlide, { toValue: 0, useNativeDriver: true, bounciness: 7, speed: 11 }).start(),
      150);
      onReveal();
    }, maxMarkerDelay + 300);
    revealTimeoutsRef.current.push(uiReveal);
  }

  // ── Visible markers ────────────────────────────────────────────────────────
  const visibleMarkers = useMemo(() => {
    if (markersFullyRevealed) {
      return [...MAP_MARKERS.filter((m) => activeCats.has(m.type as MarkerType)), USER_MARKER];
    }
    const revealed = MAP_MARKERS.filter((m) => revealedIds.has(m.id));
    return [...revealed, USER_MARKER];
  }, [markersFullyRevealed, revealedIds, activeCats]);

  const activeCount = activeCats.size;
  const totalCount  = ALL_CATEGORIES.length;

  const dropdownOpacity   = dropAnim;
  const dropdownTranslate = dropAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });

  return (
    <View style={styles.mapRoot} collapsable={false}>

      {/* ── Full-screen map ───────────────────────────────────────────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <MapCanvas markers={visibleMarkers} />
      </View>

      {/* ── Wave ring (single, pointer-events:none) ───────────────────── */}
      <View style={[StyleSheet.absoluteFill, styles.waveContainer]} pointerEvents="none">
        <Animated.View style={[styles.waveRing, { opacity: waveOpacity, transform: [{ scale: waveScale }] }]} />
      </View>

      {/* ── Top chrome (slides down on reveal) ───────────────────────── */}
      <Animated.View
        style={[
          styles.mapChromeTop,
          { paddingTop: insets.top + 6, transform: [{ translateY: topUiSlide }] },
        ]}
        pointerEvents="box-none">

        <BlurView intensity={Platform.OS === 'web' ? 24 : 50} tint="dark" style={styles.searchGlass}>
          <View style={styles.searchInner}>
            <Icon source="magnify" size={18} color={COLORS.textMuted} />
            <TextInput
              placeholder="Search location..."
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              editable={false}
            />
          </View>
        </BlurView>

        <View style={styles.filterRow}>
          <Pressable
            onPress={toggleDropdown}
            style={({ pressed }) => [styles.filterTrigger, pressed && styles.filterTriggerPressed]}>
            <Icon source="layers-triple" size={15} color={COLORS.text} />
            <Text style={styles.filterTriggerText}>
              Layers{activeCount < totalCount ? ` (${activeCount}/${totalCount})` : ''}
            </Text>
            <Icon
              source={dropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={COLORS.textMuted}
            />
          </Pressable>
        </View>

        {dropdownOpen && (
          <Animated.View
            style={[
              styles.dropdownPanel,
              { opacity: dropdownOpacity, transform: [{ translateY: dropdownTranslate }] },
            ]}>
            <BlurView intensity={Platform.OS === 'web' ? 22 : 48} tint="dark" style={styles.dropdownBlur}>
              {ALL_CATEGORIES.map((cat, i) => {
                const active = activeCats.has(cat.key);
                const count  = MAP_MARKERS.filter((m) => m.type === cat.key).length;
                return (
                  <View key={cat.key}>
                    <Pressable
                      onPress={() => toggleCat(cat.key)}
                      style={({ pressed }) => [styles.dropdownRow, pressed && styles.dropdownRowPressed]}>
                      <View style={[styles.dropdownDot, { backgroundColor: active ? CAT_COLOR[cat.key] : 'rgba(255,255,255,0.15)' }]} />
                      <Text style={[styles.dropdownLabel, !active && styles.dropdownLabelMuted]}>{cat.label}</Text>
                      <Text style={styles.dropdownCount}>{count}</Text>
                      <Icon
                        source={active ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={active ? CAT_COLOR[cat.key] : 'rgba(255,255,255,0.2)'}
                      />
                    </Pressable>
                    {i < ALL_CATEGORIES.length - 1 && <View style={styles.dropdownSep} />}
                  </View>
                );
              })}
            </BlurView>
          </Animated.View>
        )}
      </Animated.View>

      {/* ── FABs (slide in from right on reveal) ─────────────────────── */}
      <Animated.View
        style={[styles.fabColumn, { bottom: fabBottom, transform: [{ translateX: fabsSlide }] }]}
        pointerEvents="box-none">
        <Pressable>
          <BlurView intensity={48} tint="dark" style={styles.fabCircle}>
            <Icon source="crosshairs-gps" size={22} color={COLORS.text} />
          </BlurView>
        </Pressable>
        <Pressable>
          <View style={styles.fabReport}>
            <Icon source="plus" size={28} color="#000000" />
          </View>
        </Pressable>
      </Animated.View>

      {/* ── Pulse button (shown only before reveal) ───────────────────── */}
      {phase !== 'revealed' && (
        <Animated.View
          style={[
            styles.pulseButtonWrap,
            { bottom: WIN_H * 0.1 + insets.bottom },
            { opacity: pulseButtonOpacity, transform: [{ scale: pulseButtonScale }] },
          ]}
          pointerEvents="box-none">
          <Pressable
            onPress={handlePulse}
            style={({ pressed }) => [styles.pulseButton, pressed && styles.pulseButtonPressed]}>
            <Text style={styles.pulseButtonText}>Pulse!</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

function FeedScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + TAB_BAR_H + TAB_PILL_BOTTOM + 12;

  const safetyItems = MAP_MARKERS.filter((m) => m.type === 'safety');
  const communityItems = MAP_MARKERS.filter((m) => m.type === 'community');
  const bathroomItems = MAP_MARKERS.filter((m) => m.type === 'bathroom');

  return (
    <ScrollView
      style={styles.feedPage}
      contentContainerStyle={[styles.feedPageContent, { paddingBottom: bottomPad }]}>

      {/* Header */}
      <View style={styles.feedHeader}>
        <Text style={styles.feedHeading}>Today in New York</Text>
        <Text style={styles.feedSubheading}>Live incidents + community events near you</Text>
      </View>

      {/* Safety section */}
      <View style={styles.feedSection}>
        <View style={styles.feedSectionTitle}>
          <View style={[styles.feedSectionDot, { backgroundColor: COLORS.safety }]} />
          <Text style={styles.feedSectionLabel}>Safety &amp; Incidents</Text>
          <View style={styles.feedSectionBadge}>
            <Text style={styles.feedSectionBadgeText}>{safetyItems.length}</Text>
          </View>
        </View>
        <BlurView intensity={Platform.OS === 'web' ? 18 : 35} tint="dark" style={styles.feedGroup}>
          {safetyItems.map((item, i) => (
            <View key={item.id}>
              <Pressable style={({ pressed }) => [styles.feedRow, pressed && styles.feedRowPressed]}>
                <View style={[styles.feedAccent, { backgroundColor: item.live ? COLORS.live : COLORS.safety }]} />
                <View style={[styles.feedEmojiDot, { borderColor: item.live ? COLORS.live : COLORS.safety }]}>
                  <Text style={styles.feedEmojiChar}>{item.icon}</Text>
                </View>
                <View style={styles.feedRowMain}>
                  <Text style={styles.feedRowTitle} numberOfLines={2}>{item.label}</Text>
                  <Text style={styles.feedRowSub}>Safety · NYC</Text>
                </View>
                <View style={styles.feedRowRight}>
                  <View style={[styles.timeBadge, item.live && styles.timeBadgeLive]}>
                    <Text style={[styles.timeBadgeText, item.live && styles.timeBadgeTextLive]}>
                      {item.time}
                    </Text>
                  </View>
                  <Icon source="chevron-right" size={18} color="rgba(255,255,255,0.18)" />
                </View>
              </Pressable>
              {i < safetyItems.length - 1 && <View style={styles.feedSep} />}
            </View>
          ))}
        </BlurView>
      </View>

      {/* Community section */}
      <View style={styles.feedSection}>
        <View style={styles.feedSectionTitle}>
          <View style={[styles.feedSectionDot, { backgroundColor: COLORS.community }]} />
          <Text style={styles.feedSectionLabel}>Community Events</Text>
          <View style={styles.feedSectionBadge}>
            <Text style={styles.feedSectionBadgeText}>{communityItems.length}</Text>
          </View>
        </View>
        <BlurView intensity={Platform.OS === 'web' ? 18 : 35} tint="dark" style={styles.feedGroup}>
          {communityItems.map((item, i) => (
            <View key={item.id}>
              <Pressable style={({ pressed }) => [styles.feedRow, pressed && styles.feedRowPressed]}>
                <View style={[styles.feedAccent, { backgroundColor: COLORS.community }]} />
                <View style={[styles.feedEmojiDot, { borderColor: COLORS.community }]}>
                  <Text style={styles.feedEmojiChar}>{item.icon}</Text>
                </View>
                <View style={styles.feedRowMain}>
                  <Text style={styles.feedRowTitle} numberOfLines={2}>{item.label}</Text>
                  <Text style={styles.feedRowSub}>Community · NYC</Text>
                </View>
                <View style={styles.feedRowRight}>
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{item.time}</Text>
                  </View>
                  <Icon source="chevron-right" size={18} color="rgba(255,255,255,0.18)" />
                </View>
              </Pressable>
              {i < communityItems.length - 1 && <View style={styles.feedSep} />}
            </View>
          ))}
        </BlurView>
      </View>

      {/* Bathrooms section */}
      <View style={styles.feedSection}>
        <View style={styles.feedSectionTitle}>
          <View style={[styles.feedSectionDot, { backgroundColor: '#8B5CF6' }]} />
          <Text style={styles.feedSectionLabel}>Public Bathrooms</Text>
          <View style={styles.feedSectionBadge}>
            <Text style={styles.feedSectionBadgeText}>{bathroomItems.length}</Text>
          </View>
        </View>
        <BlurView intensity={Platform.OS === 'web' ? 18 : 35} tint="dark" style={styles.feedGroup}>
          {bathroomItems.map((item, i) => (
            <View key={item.id}>
              <Pressable style={({ pressed }) => [styles.feedRow, pressed && styles.feedRowPressed]}>
                <View style={[styles.feedAccent, { backgroundColor: '#8B5CF6' }]} />
                <View style={[styles.feedEmojiDot, { borderColor: '#8B5CF6' }]}>
                  <Text style={styles.feedEmojiChar}>{item.icon}</Text>
                </View>
                <View style={styles.feedRowMain}>
                  <Text style={styles.feedRowTitle} numberOfLines={2}>{item.label}</Text>
                  <Text style={styles.feedRowSub}>Public facility · NYC</Text>
                </View>
                <View style={styles.feedRowRight}>
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{item.time}</Text>
                  </View>
                  <Icon source="chevron-right" size={18} color="rgba(255,255,255,0.18)" />
                </View>
              </Pressable>
              {i < bathroomItems.length - 1 && <View style={styles.feedSep} />}
            </View>
          ))}
        </BlurView>
      </View>

      {/* MTA card */}
      <Card style={styles.feedCard} mode="elevated">
        <Card.Title title="Transit" titleStyle={styles.cardTitle} subtitle="MTA service updates" subtitleStyle={styles.cardSubtitle} />
        <Card.Content>
          <Text style={styles.feedBody}>Northbound service running with 8 min delays on the 2/3 line.</Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

// ── Quest data ─────────────────────────────────────────────────────────────────

const ACTIVE_QUESTS = [
  { id: 'q1', title: 'Urban Explorer',      desc: 'Visit 5 different Manhattan neighborhoods', icon: 'map-marker-path', color: COLORS.primary,      progress: 3, total: 5, xp: 150 },
  { id: 'q2', title: 'Safety Scout',        desc: 'Report 3 incidents in your area',           icon: 'shield-alert',    color: CAT_COLOR.safety,    progress: 1, total: 3, xp: 200 },
  { id: 'q3', title: 'Community Connector', desc: 'Attend 2 community events this week',       icon: 'account-group',   color: CAT_COLOR.community, progress: 0, total: 2, xp: 120 },
  { id: 'q4', title: 'Bathroom Scout',      desc: 'Find and verify public restrooms',          icon: 'toilet',          color: CAT_COLOR.bathroom,  progress: 2, total: 3, xp: 80  },
];

const COMPLETED_QUESTS = [
  { id: 'c1', title: 'First Report',  desc: 'Submit your first city report', icon: 'flag-checkered',    xp: 50 },
  { id: 'c2', title: 'Commuter',      desc: 'Log 5 subway trips',            icon: 'train-variant',     xp: 75 },
  { id: 'c3', title: 'Early Bird',    desc: 'Check the app before 8 AM',     icon: 'weather-sunset-up', xp: 30 },
];

function QuestsScreen() {
  const insets    = useSafeAreaInsets();
  const bottomPad = insets.bottom + TAB_BAR_H + TAB_PILL_BOTTOM + 12;

  return (
    <ScrollView
      style={styles.feedPage}
      contentContainerStyle={[styles.feedPageContent, { paddingBottom: bottomPad }]}>

      <View style={styles.feedHeader}>
        <Text style={styles.feedHeading}>City Quests</Text>
        <Text style={styles.feedSubheading}>Complete challenges, earn your city cred</Text>
      </View>

      {/* ── Stats row ───────────────────────────────────────── */}
      <View style={styles.statRow}>
        {([
          { num: '7',   label: 'Day Streak', icon: 'fire',             color: CAT_COLOR.live      },
          { num: '680', label: 'Total XP',   icon: 'star-four-points', color: COLORS.primary      },
          { num: '3',   label: 'Complete',   icon: 'check-circle',     color: CAT_COLOR.community },
        ] as const).map((s) => (
          <BlurView key={s.label} intensity={Platform.OS === 'web' ? 18 : 35} tint="dark" style={styles.statCard}>
            <Text style={styles.statNum}>{s.num}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Icon source={s.icon} size={15} color={s.color} />
          </BlurView>
        ))}
      </View>

      {/* ── Daily challenge ─────────────────────────────────── */}
      <View style={styles.feedSection}>
        <View style={styles.feedSectionTitle}>
          <View style={[styles.feedSectionDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.feedSectionLabel}>Daily Challenge</Text>
          <View style={[styles.feedSectionBadge, { backgroundColor: `${COLORS.primary}22` }]}>
            <Text style={[styles.feedSectionBadgeText, { color: COLORS.primary }]}>Resets 6h 42m</Text>
          </View>
        </View>
        <BlurView
          intensity={Platform.OS === 'web' ? 18 : 35}
          tint="dark"
          style={[styles.feedGroup, styles.dailyCard, { borderColor: `${COLORS.primary}40` }]}>
          <View style={styles.questRowHeader}>
            <View style={[styles.questIcon, { backgroundColor: `${COLORS.primary}22` }]}>
              <Icon source="lightning-bolt" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.questTitle}>Rush Hour Reporter</Text>
              <Text style={styles.questDesc}>Spot and report a transit delay between 5–7 PM today</Text>
            </View>
            <View style={[styles.xpBadge, { backgroundColor: `${COLORS.primary}22` }]}>
              <Text style={[styles.xpText, { color: COLORS.primary }]}>+300 XP</Text>
            </View>
          </View>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: '0%', backgroundColor: COLORS.primary }]} />
            </View>
            <Text style={styles.progressLabel}>0 / 1</Text>
          </View>
        </BlurView>
      </View>

      {/* ── Active quests ───────────────────────────────────── */}
      <View style={styles.feedSection}>
        <View style={styles.feedSectionTitle}>
          <View style={[styles.feedSectionDot, { backgroundColor: COLORS.warning }]} />
          <Text style={styles.feedSectionLabel}>In Progress</Text>
          <View style={styles.feedSectionBadge}>
            <Text style={styles.feedSectionBadgeText}>{ACTIVE_QUESTS.length}</Text>
          </View>
        </View>
        <BlurView intensity={Platform.OS === 'web' ? 18 : 35} tint="dark" style={styles.feedGroup}>
          {ACTIVE_QUESTS.map((q, i) => {
            const pct = Math.round((q.progress / q.total) * 100);
            return (
              <View key={q.id}>
                <Pressable style={({ pressed }) => [styles.questRow, pressed && styles.feedRowPressed]}>
                  <View style={[styles.questIcon, { backgroundColor: `${q.color}20` }]}>
                    <Icon source={q.icon} size={18} color={q.color} />
                  </View>
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={styles.questRowHeader}>
                      <Text style={[styles.questTitle, { flex: 1 }]}>{q.title}</Text>
                      <Text style={[styles.xpText, { color: q.color }]}>+{q.xp} XP</Text>
                    </View>
                    <Text style={styles.questDesc}>{q.desc}</Text>
                    <View style={styles.progressRow}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: q.color }]} />
                      </View>
                      <Text style={styles.progressLabel}>{q.progress}/{q.total}</Text>
                    </View>
                  </View>
                </Pressable>
                {i < ACTIVE_QUESTS.length - 1 && <View style={styles.feedSep} />}
              </View>
            );
          })}
        </BlurView>
      </View>

      {/* ── Completed quests ────────────────────────────────── */}
      <View style={styles.feedSection}>
        <View style={styles.feedSectionTitle}>
          <View style={[styles.feedSectionDot, { backgroundColor: COLORS.textMuted }]} />
          <Text style={styles.feedSectionLabel}>Completed</Text>
          <View style={styles.feedSectionBadge}>
            <Text style={styles.feedSectionBadgeText}>{COMPLETED_QUESTS.length}</Text>
          </View>
        </View>
        <BlurView intensity={Platform.OS === 'web' ? 18 : 35} tint="dark" style={styles.feedGroup}>
          {COMPLETED_QUESTS.map((q, i) => (
            <View key={q.id}>
              <View style={[styles.questRow, { opacity: 0.45 }]}>
                <View style={[styles.questIcon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                  <Icon source={q.icon} size={18} color={COLORS.textMuted} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.questRowHeader}>
                    <Text style={[styles.questTitle, { flex: 1, textDecorationLine: 'line-through', color: COLORS.textMuted }]}>
                      {q.title}
                    </Text>
                    <Icon source="check-circle" size={16} color={CAT_COLOR.community} />
                  </View>
                  <Text style={styles.questDesc}>{q.desc}</Text>
                </View>
              </View>
              {i < COMPLETED_QUESTS.length - 1 && <View style={styles.feedSep} />}
            </View>
          ))}
        </BlurView>
      </View>

    </ScrollView>
  );
}

// ── Profile data ───────────────────────────────────────────────────────────────

const PROFILE_SECTIONS = [
  {
    title: 'My City',
    items: [
      { icon: 'map-marker-radius', label: 'Neighborhood',  value: 'Lower East Side'            },
      { icon: 'bell-ring-outline', label: 'Safety Alerts', value: 'Enabled'                    },
      { icon: 'tag-heart-outline', label: 'Interests',     value: 'Music, Sports, Volunteering' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { icon: 'layers-outline',   label: 'Default Map View', value: 'All Categories' },
      { icon: 'theme-light-dark', label: 'Appearance',       value: 'Dark'           },
      { icon: 'translate',        label: 'Language',         value: 'English'        },
    ],
  },
  {
    title: 'About',
    items: [
      { icon: 'information-outline',   label: 'About City Pulse', value: '' },
      { icon: 'message-alert-outline', label: 'Send Feedback',    value: '' },
      { icon: 'shield-lock-outline',   label: 'Privacy Policy',   value: '' },
    ],
  },
];

function ProfileScreen() {
  const insets    = useSafeAreaInsets();
  const bottomPad = insets.bottom + TAB_BAR_H + TAB_PILL_BOTTOM + 12;

  return (
    <ScrollView
      style={styles.feedPage}
      contentContainerStyle={[styles.feedPageContent, { paddingBottom: bottomPad }]}>

      {/* ── Avatar block ─────────────────────────────────────── */}
      <View style={styles.profileHero}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>SS</Text>
        </View>
        <Text style={styles.profileName}>Sam S.</Text>
        <Text style={styles.profileHandle}>@sams · Member since Mar 2026</Text>
        <Pressable style={({ pressed }) => [styles.profileEditBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.profileEditText}>Edit Profile</Text>
        </Pressable>
      </View>

      {/* ── Stats row ────────────────────────────────────────── */}
      <View style={styles.statRow}>
        {([
          { num: '14', label: 'Reports', icon: 'flag',           color: CAT_COLOR.safety    },
          { num: '8',  label: 'Events',  icon: 'calendar-check', color: CAT_COLOR.community },
          { num: '7',  label: 'Streak',  icon: 'fire',           color: CAT_COLOR.live      },
        ] as const).map((s) => (
          <BlurView key={s.label} intensity={Platform.OS === 'web' ? 18 : 35} tint="dark" style={styles.statCard}>
            <Text style={styles.statNum}>{s.num}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Icon source={s.icon} size={15} color={s.color} />
          </BlurView>
        ))}
      </View>

      {/* ── Settings sections ────────────────────────────────── */}
      {PROFILE_SECTIONS.map((section) => (
        <View key={section.title} style={styles.feedSection}>
          <View style={styles.feedSectionTitle}>
            <Text style={styles.feedSectionLabel}>{section.title}</Text>
          </View>
          <BlurView intensity={Platform.OS === 'web' ? 18 : 35} tint="dark" style={styles.feedGroup}>
            {section.items.map((item, i) => (
              <View key={item.label}>
                <Pressable style={({ pressed }) => [styles.profileRow, pressed && styles.feedRowPressed]}>
                  <View style={styles.profileRowIcon}>
                    <Icon source={item.icon} size={18} color={COLORS.primary} />
                  </View>
                  <Text style={styles.profileRowLabel}>{item.label}</Text>
                  {item.value ? (
                    <Text style={styles.profileRowValue} numberOfLines={1}>{item.value}</Text>
                  ) : null}
                  <Icon source="chevron-right" size={18} color="rgba(255,255,255,0.18)" />
                </Pressable>
                {i < section.items.length - 1 && <View style={styles.feedSep} />}
              </View>
            ))}
          </BlurView>
        </View>
      ))}

      {/* ── Sign out ─────────────────────────────────────────── */}
      <Pressable style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}>
        <Icon source="logout-variant" size={18} color={CAT_COLOR.safety} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

    </ScrollView>
  );
}

type NavDef = {
  key: TabKey;
  label: string;
  active: string;
  inactive: string;
  badge?: string;
};

const NAV: NavDef[] = [
  { key: 'map', label: 'Map', active: 'map', inactive: 'map-outline' },
  { key: 'feed', label: 'Feed', active: 'newspaper-variant', inactive: 'newspaper-variant-outline', badge: '26' },
  { key: 'quests', label: 'Quests', active: 'trophy', inactive: 'trophy-outline', badge: '3' },
  { key: 'profile', label: 'Profile', active: 'account', inactive: 'account-outline', badge: '50+' },
];

function BottomNav({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.pillShell,
        { bottom: Math.max(insets.bottom, 8) + TAB_PILL_BOTTOM },
      ]}
      pointerEvents="box-none">
      <BlurView
        intensity={Platform.OS === 'web' ? 28 : 55}
        tint="dark"
        style={styles.pillBlur}>
        <View style={styles.pillInner}>
          {NAV.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => onChange(item.key)}
                style={styles.navHit}>
                <View style={styles.navIconWrap}>
                  <View style={[styles.navTabItem, active && styles.navTabItemActive]}>
                    <Icon
                      source={active ? item.active : item.inactive}
                      size={20}
                      color={active ? '#000000' : COLORS.textMuted}
                    />
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                      {item.label}
                    </Text>
                  </View>
                  {item.badge && !active ? (
                    <View style={styles.navBadge}>
                      <Text style={styles.navBadgeText}>{item.badge}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webCenterer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Platform.OS === 'web' ? 10 : 0,
    backgroundColor: '#000000',
  },
  mobileFrame: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 430 : undefined,
    borderRadius: Platform.OS === 'web' ? 28 : 0,
    overflow: 'hidden',
    borderWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: COLORS.border,
    backgroundColor: '#000000',
    position: 'relative',
  },
  mobileFrameMap: {
    backgroundColor: 'transparent',
  },
  screen: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'transparent',
  },

  // ─── Map screen ────────────────────────────────────────────────────────────
  mapRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  mapChromeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  searchGlass: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlay,
    marginBottom: 8,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
  },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.overlay,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTriggerPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterTriggerText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  dropdownPanel: {
    marginTop: 6,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 32px rgba(0,0,0,0.55)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
      android: { elevation: 16 },
    }),
  },
  dropdownBlur: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlay,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  dropdownRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dropdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dropdownLabel: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownLabelMuted: {
    color: COLORS.textMuted,
  },
  dropdownCount: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
    marginRight: 4,
  },
  dropdownSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: 14,
  },
  fabColumn: {
    position: 'absolute',
    right: 16,
    zIndex: 25,
    gap: 12,
    alignItems: 'flex-end',
  },
  fabCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  fabReport: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.5)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 10 },
      android: { elevation: 12 },
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.55)' },
    }),
  },

  // ─── Feed screen ────────────────────────────────────────────────────────────
  feedPage: {
    flex: 1,
    backgroundColor: '#000000',
  },
  feedPageContent: {
    padding: 16,
  },
  feedHeader: {
    paddingTop: 16,
    paddingBottom: 20,
  },
  feedHeading: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  feedSubheading: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  feedSection: {
    marginBottom: 20,
  },
  feedSectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  feedSectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  feedSectionLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flex: 1,
  },
  feedSectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  feedSectionBadgeText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  feedGroup: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 12,
    gap: 10,
  },
  feedRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  feedAccent: {
    width: 4,
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: 2,
  },
  feedEmojiDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,12,14,0.9)',
    borderWidth: 2,
  },
  feedEmojiChar: {
    fontSize: 16,
    lineHeight: 19,
    textAlign: 'center',
  },
  feedRowMain: {
    flex: 1,
    gap: 3,
  },
  feedRowTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  feedRowSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  feedRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: COLORS.timeBadgeBg,
  },
  timeBadgeLive: {
    backgroundColor: 'rgba(249, 115, 22, 0.18)',
  },
  timeBadgeText: {
    color: COLORS.timeBadgeText,
    fontSize: 11,
    fontWeight: '700',
  },
  timeBadgeTextLive: {
    color: COLORS.live,
  },
  feedSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 16,
  },

  // ─── Other screens ─────────────────────────────────────────────────────────
  page: {
    flex: 1,
    backgroundColor: '#000000',
  },
  pageContent: {
    padding: 16,
  },
  pageHeader: {
    paddingTop: 16,
    paddingBottom: 20,
  },
  pageHeading: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  feedCard: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  feedBody: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    lineHeight: 22,
  },
  listTitle: {
    color: COLORS.text,
    fontSize: 16,
  },
  listDesc: {
    color: COLORS.textMuted,
    fontSize: 13,
  },

  // ─── Quests ────────────────────────────────────────────────────────────────
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  statNum: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  dailyCard: {
    padding: 14,
    gap: 12,
  },
  questRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  questRowHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  questIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  questTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700' as const,
    lineHeight: 19,
  },
  questDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 17,
  },
  xpBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  xpText: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  progressRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  progressLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700' as const,
    minWidth: 28,
    textAlign: 'right' as const,
  },

  // ─── Profile ───────────────────────────────────────────────────────────────
  profileHero: {
    alignItems: 'center' as const,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 6,
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 4,
    ...Platform.select({
      ios:     { shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16 },
      android: { elevation: 12 },
      web:     { boxShadow: '0 0 24px 6px rgba(107,71,254,0.5)' },
    }),
  },
  profileAvatarText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  profileName: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800' as const,
    letterSpacing: -0.3,
  },
  profileHandle: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  profileEditBtn: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  profileEditText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  profileRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  profileRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}18`,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  profileRowLabel: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  profileRowValue: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500' as const,
    maxWidth: 130,
    textAlign: 'right' as const,
  },
  signOutBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${CAT_COLOR.safety}30`,
    backgroundColor: `${CAT_COLOR.safety}10`,
  },
  signOutText: {
    color: CAT_COLOR.safety,
    fontSize: 15,
    fontWeight: '700' as const,
  },

  // ─── Pill tab bar ──────────────────────────────────────────────────────────
  pillShell: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 50,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20 },
      android: { elevation: 24 },
      web: { boxShadow: '0 12px 40px rgba(0,0,0,0.6)' },
    }),
  },
  pillBlur: {
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: COLORS.pillBg,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    height: TAB_BAR_H,
  },
  navHit: {
    flex: 1,
    alignItems: 'center',
  },
  navIconWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  navTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 30,
  },
  navTabItemActive: {
    backgroundColor: COLORS.primary,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  navLabelActive: {
    color: '#000000',
  },
  navBadge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: COLORS.safety,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },

  // ─── Intro wave + Pulse button ─────────────────────────────────────────────
  waveContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  waveRing: {
    width: 600,
    height: 600,
    borderRadius: 300,
    borderWidth: 10,
    borderColor: CAT_COLOR.user,
    backgroundColor: 'transparent',
  },
  pulseButtonWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 60,
  },
  pulseButton: {
    paddingHorizontal: 44,
    paddingVertical: 18,
    borderRadius: 50,
    backgroundColor: CAT_COLOR.user,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    ...Platform.select({
      ios:     { shadowColor: CAT_COLOR.user, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 22 },
      android: { elevation: 18 },
      web:     { boxShadow: `0 0 32px 8px rgba(168,85,247,0.55), 0 8px 24px rgba(0,0,0,0.5)` },
    }),
  },
  pulseButtonPressed: {
    opacity: 0.85,
  },
  pulseButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
