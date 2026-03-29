import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import MapCanvas from '@/components/map/MapCanvas';
import type { MapCanvasHandle, MapCanvasPin, MapPolyline, MapRegion, MapTheme } from '@/components/map/mapTypes';
import { useAuth } from '@/contexts/AuthContext';
import { useMapFocus } from '@/contexts/MapFocusContext';
import { useFloatingTabBarPadding } from '@/hooks/useFloatingTabBarPadding';
import { useMapExtraLayers } from '@/hooks/useMapExtraLayers';
import { markerColor, useMapPinsState } from '@/hooks/useMapPinsState';
import {
  cancelEventSignup,
  hasSignedUpForEvent,
  signUpForEvent,
} from '@/lib/eventSignupService';
import { fetchEventById, fetchIncidentById, type EventDetail, type IncidentDetail } from '@/lib/firestoreFeed';
import { isFirebaseConfigured } from '@/lib/firebase';
import type { MapMarkerLayer } from '@/components/map/mapTypes';
import type { IncidentPoint } from '@/lib/routeSafetyFromIncidents';
import {
  acceptQuest,
  createQuest,
  denyQuest,
  subscribeDeniedQuestIds,
  subscribeOpenQuests,
  type QuestDoc,
} from '@/lib/questService';
import {
  ALL_MAP_LAYERS,
  defaultLayerVisibility,
  LAYER_VISUAL,
  PIN_BATHROOM_BLUE,
  PIN_QUEST_AMBER,
} from '@/lib/mapMarkerLayers';
import { shouldShowMapListInsteadOfMap } from '@/lib/mapsEnv';
import { patchEventSupplementaryInfo } from '@/lib/eventDetailsUpdate';
import { setEventBookmarked } from '@/lib/eventEngagement';
import { fetchTransitRoutesWithSafety, type TransitRouteResult } from '@/lib/transitDirections';
import { GeminiEventInsights } from '@/components/GeminiEventInsights';
import { TransitItinerary } from '@/components/TransitItinerary';
import { MapFloatingActions } from '@/components/map/MapFloatingActions';
import { formatDisplayTitle } from '@/lib/formatDisplayTitle';
import { logRouting } from '@/lib/routingLog';

const LOCAL_DELTA = 0.028;
/** Tighter zoom when focusing a pin from the feed or map (~2 city blocks). */
const PIN_FOCUS_DELTA = 0.009;
const LEGEND_BAR_HEIGHT = 56;
const LEGEND_BOTTOM_PAD = 8;
/** Layer toggle at bottom; transit panel stacks above it. */
const TRANSIT_PANEL_BOTTOM_OFFSET = LEGEND_BOTTOM_PAD + LEGEND_BAR_HEIGHT + LEGEND_BOTTOM_PAD;
const NYC_FALLBACK: MapRegion = {
  latitude: 40.7128,
  longitude: -74.006,
  latitudeDelta: LOCAL_DELTA,
  longitudeDelta: LOCAL_DELTA,
};

const WAVE_BASE = 600;
/** Short ring animation so it does not block the UI for many seconds. */
const WAVE_DURATION_MS = 2_800;
/** Intro pulse ring — purple (not theme teal). */
const INTRO_WAVE_COLOR = '#9333ea';

export default function MapScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const insets = useSafeAreaInsets();
  const tabBarPad = useFloatingTabBarPadding();
  const { focusGeneration, lastFocus } = useMapFocus();
  const { user, profile, initializing: authInit } = useAuth();
  const { pins, loading, error, load } = useMapPinsState();
  const { bathrooms } = useMapExtraLayers();
  const mapRef = useRef<MapCanvasHandle>(null);

  const [mapTheme, setMapTheme] = useState<MapTheme>('light');
  /** Full page reload starts fresh, but SPA tab switches and bfcache can keep old state — reset when the map tab is shown. */
  useFocusEffect(
    useCallback(() => {
      setMapTheme('light');
      let cancelled = false;

      async function refreshUserLocation() {
        try {
          if (Platform.OS === 'web') {
            if (typeof navigator === 'undefined' || !navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (cancelled) return;
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setUserOrigin({ lat, lng });
                mapRef.current?.animateToRegion(
                  {
                    latitude: lat,
                    longitude: lng,
                    latitudeDelta: LOCAL_DELTA,
                    longitudeDelta: LOCAL_DELTA,
                  },
                  500,
                );
              },
              () => {},
              { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
            );
            return;
          }
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled || status !== 'granted') return;
          const loc = await Location.getCurrentPositionAsync({});
          if (cancelled) return;
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          setUserOrigin({ lat, lng });
          mapRef.current?.animateToRegion(
            {
              latitude: lat,
              longitude: lng,
              latitudeDelta: LOCAL_DELTA,
              longitudeDelta: LOCAL_DELTA,
            },
            500,
          );
        } catch {
          /* simulator off, permission denied, etc. */
        }
      }

      void refreshUserLocation();

      return () => {
        cancelled = true;
      };
    }, []),
  );
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPageShow = () => setMapTheme('light');
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
  const [userOrigin, setUserOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [layerVisibility, setLayerVisibility] = useState(defaultLayerVisibility);
  const [explorePin, setExplorePin] = useState<MapCanvasPin | null>(null);
  const [exploreFetched, setExploreFetched] = useState<EventDetail | IncidentDetail | null>(null);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [eventRsvp, setEventRsvp] = useState(false);
  const [exploreEditName, setExploreEditName] = useState('');
  const [exploreEditEmail, setExploreEditEmail] = useState('');
  const [exploreEditPhone, setExploreEditPhone] = useState('');
  const [exploreEditDateText, setExploreEditDateText] = useState('');
  const [exploreDetailSaving, setExploreDetailSaving] = useState(false);
  const [exploreDetailError, setExploreDetailError] = useState<string | null>(null);
  const [exploreRsvpError, setExploreRsvpError] = useState<string | null>(null);

  const [transitRoutes, setTransitRoutes] = useState<TransitRouteResult[]>([]);
  const [transitLoading, setTransitLoading] = useState(false);
  const [selectedTransitId, setSelectedTransitId] = useState<string | null>(null);
  const [transitDestLabel, setTransitDestLabel] = useState('');
  const [transitPanelOpen, setTransitPanelOpen] = useState(false);
  const [transitDirectionsError, setTransitDirectionsError] = useState<string | null>(null);
  const [mapPickTransit, setMapPickTransit] = useState(false);
  const [mapPickQuest, setMapPickQuest] = useState(false);
  const [newQuestOpen, setNewQuestOpen] = useState(false);
  const [newQuestLat, setNewQuestLat] = useState<number | null>(null);
  const [newQuestLng, setNewQuestLng] = useState<number | null>(null);
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [newQuestDesc, setNewQuestDesc] = useState('');
  const [newQuestParticipants, setNewQuestParticipants] = useState('1');
  const [newQuestSaving, setNewQuestSaving] = useState(false);
  const [newQuestError, setNewQuestError] = useState<string | null>(null);
  const [newQuestRequireApproval, setNewQuestRequireApproval] = useState(false);

  const [openQuests, setOpenQuests] = useState<QuestDoc[]>([]);
  const [deniedQuestIds, setDeniedQuestIds] = useState<Set<string>>(() => new Set());
  const [pickedQuest, setPickedQuest] = useState<QuestDoc | null>(null);
  const [questBusy, setQuestBusy] = useState(false);

  /** Opening “pulse” intro: wave ring + staggered UI (FABs). */
  const [introActive, setIntroActive] = useState(true);
  const pulseStartedRef = useRef(false);
  const revealTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const visiblePinsRef = useRef<MapCanvasPin[]>([]);
  const pendingFeedPinExploreIdRef = useRef<string | null>(null);

  const waveScale = useRef(new Animated.Value(0.01)).current;
  const waveOpacity = useRef(new Animated.Value(0)).current;
  const legendSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user?.uid) {
      setOpenQuests([]);
      setDeniedQuestIds(new Set());
      return;
    }
    const unsubDeny = subscribeDeniedQuestIds(user.uid, setDeniedQuestIds);
    return unsubDeny;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setOpenQuests([]);
      return;
    }
    return subscribeOpenQuests(user.uid, deniedQuestIds, setOpenQuests);
  }, [user?.uid, deniedQuestIds]);

  const openPinExplore = useCallback((p: MapCanvasPin) => {
    setExplorePin(p);
    setExploreFetched(null);
    setExploreDetailError(null);
    setExploreRsvpError(null);
    mapRef.current?.animateToRegion(
      {
        latitude: p.latitude,
        longitude: p.longitude,
        latitudeDelta: PIN_FOCUS_DELTA,
        longitudeDelta: PIN_FOCUS_DELTA,
      },
      400,
    );
    const m = p.detailMeta;
    if (!m || m.kind === 'bathroom' || m.kind === 'quest') {
      setExploreLoading(false);
      return;
    }
    setExploreLoading(true);
    void (async () => {
      try {
        if (m.kind === 'event') {
          setExploreFetched(await fetchEventById(m.id));
        } else {
          setExploreFetched(await fetchIncidentById(m.id));
        }
      } finally {
        setExploreLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user?.uid || !exploreFetched || !('startTimeMs' in exploreFetched)) {
      setEventRsvp(false);
      return;
    }
    const ev = exploreFetched;
    void hasSignedUpForEvent(user.uid, ev.id).then(setEventRsvp);
  }, [user?.uid, exploreFetched]);

  useEffect(() => {
    if (!exploreFetched || !('startTimeMs' in exploreFetched)) {
      setExploreEditName('');
      setExploreEditEmail('');
      setExploreEditPhone('');
      setExploreEditDateText('');
      return;
    }
    const ev = exploreFetched;
    setExploreEditName(ev.organizerName ?? '');
    setExploreEditEmail(ev.organizerEmail ?? '');
    setExploreEditPhone(ev.organizerPhone ?? '');
    setExploreEditDateText(
      ev.startTimeMs > 0 ? new Date(ev.startTimeMs).toISOString().slice(0, 16) : '',
    );
  }, [exploreFetched]);

  const incidentPoints: IncidentPoint[] = useMemo(
    () =>
      pins
        .filter((p) => p.kind === 'incident')
        .map((p) => ({
          lat: p.latitude,
          lng: p.longitude,
          timeMs: p.reportedAtMs ?? Date.now(),
        })),
    [pins],
  );

  const ensureOrigin = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    if (userOrigin) return userOrigin;
    if (Platform.OS === 'web') {
      return await new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setUserOrigin(o);
            resolve(o);
          },
          () => resolve(null),
          { enableHighAccuracy: false, maximumAge: 30_000, timeout: 12_000 },
        );
      });
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({});
    const o = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    setUserOrigin(o);
    return o;
  }, [userOrigin]);

  const runTransitTo = useCallback(
    async (lat: number, lng: number, label: string) => {
      logRouting('ui', 'runTransitTo invoked', { label, destination: { lat, lng } });
      const origin = await ensureOrigin();
      if (!origin) {
        logRouting('ui', 'runTransitTo blocked: no origin / location denied', {});
        setTransitPanelOpen(true);
        setTransitDestLabel('Allow location to plan transit');
        setTransitRoutes([]);
        setTransitDirectionsError(null);
        return;
      }
      logRouting('ui', 'runTransitTo using origin', { origin, label });
      setTransitLoading(true);
      setTransitDestLabel(label);
      setTransitPanelOpen(true);
      setTransitDirectionsError(null);
      try {
        const { routes, errorMessage } = await fetchTransitRoutesWithSafety(
          origin,
          { lat, lng },
          incidentPoints,
        );
        setTransitRoutes(routes);
        setSelectedTransitId(routes[0]?.id ?? null);
        setTransitDirectionsError(
          routes.length > 0
            ? null
            : (errorMessage?.trim() ||
                'No transit routes returned. Check Profile → Routing log for the Google status, or try another destination or time.'),
        );
        logRouting('ui', 'runTransitTo completed', {
          routeCount: routes.length,
          error: errorMessage ?? null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setTransitRoutes([]);
        setSelectedTransitId(null);
        setTransitDirectionsError(
          msg.trim() ||
            'Transit routing failed unexpectedly. Check Profile → Routing log for details.',
        );
        logRouting('ui', 'runTransitTo threw', { error: msg });
      } finally {
        setTransitLoading(false);
      }
    },
    [ensureOrigin, incidentPoints],
  );

  const mapPins: MapCanvasPin[] = useMemo(() => {
    const list: MapCanvasPin[] = [];
    for (const p of pins) {
      if (p.kind === 'event') {
        const pin: MapCanvasPin = {
          id: `event-${p.id}`,
          latitude: p.latitude,
          longitude: p.longitude,
          title: formatDisplayTitle(p.title),
          description: p.description,
          color: markerColor('event'),
          useCircleMarker: false,
          layer: 'events',
          iconName: LAYER_VISUAL.events.icon,
          detailMeta: { kind: 'event', id: p.id },
          onPress: () => openPinExplore(pin),
        };
        list.push(pin);
      } else if (p.kind === 'incident') {
        const pin: MapCanvasPin = {
          id: `incident-${p.id}`,
          latitude: p.latitude,
          longitude: p.longitude,
          title: formatDisplayTitle(p.title),
          description: p.description,
          color: markerColor('incident'),
          useCircleMarker: false,
          layer: 'incidents',
          iconName: LAYER_VISUAL.incidents.icon,
          detailMeta: { kind: 'incident', id: p.id },
          onPress: () => openPinExplore(pin),
        };
        list.push(pin);
      }
    }
    for (const b of bathrooms) {
      const pin: MapCanvasPin = {
        id: b.id,
        latitude: b.latitude,
        longitude: b.longitude,
        title: b.title,
        description: b.description ? `Restroom · ${b.description}` : 'Public restroom',
        color: PIN_BATHROOM_BLUE,
        useCircleMarker: false,
        layer: 'bathrooms',
        iconName: LAYER_VISUAL.bathrooms.icon,
        detailMeta: { kind: 'bathroom', id: b.id },
        onPress: () => openPinExplore(pin),
      };
      list.push(pin);
    }
    for (const q of openQuests) {
      const pin: MapCanvasPin = {
        id: `quest-${q.id}`,
        latitude: q.lat,
        longitude: q.lng,
        title: `Quest: ${q.title}`,
        description: `${q.participantIds.length}/${q.participantsRequired} joined · ${q.authorUsername}`,
        color: PIN_QUEST_AMBER,
        useCircleMarker: false,
        layer: 'quests',
        iconName: LAYER_VISUAL.quests.icon,
        detailMeta: { kind: 'quest', id: q.id },
        onPress: () => setPickedQuest(q),
      };
      list.push(pin);
    }
    return list;
  }, [pins, bathrooms, openQuests, openPinExplore]);

  const visiblePins = useMemo(
    () => mapPins.filter((p) => layerVisibility[p.layer]),
    [mapPins, layerVisibility],
  );

  visiblePinsRef.current = visiblePins;

  useEffect(() => {
    if (focusGeneration === 0 || !lastFocus) return;
    const { lat, lng, focusPinId: pid } = lastFocus;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: PIN_FOCUS_DELTA,
        longitudeDelta: PIN_FOCUS_DELTA,
      },
      450,
    );
    if (pid) {
      const pin = visiblePinsRef.current.find((p) => p.id === pid);
      if (pin) {
        const t = setTimeout(() => openPinExplore(pin), 480);
        pendingFeedPinExploreIdRef.current = null;
        return () => clearTimeout(t);
      }
      pendingFeedPinExploreIdRef.current = pid;
    } else {
      pendingFeedPinExploreIdRef.current = null;
    }
  }, [focusGeneration, lastFocus, openPinExplore]);

  useEffect(() => {
    const pending = pendingFeedPinExploreIdRef.current;
    if (!pending) return;
    const pin = visiblePins.find((p) => p.id === pending);
    if (!pin) return;
    pendingFeedPinExploreIdRef.current = null;
    openPinExplore(pin);
  }, [visiblePins, openPinExplore]);

  const runIntroPulse = useCallback(() => {
    if (pulseStartedRef.current) return;
    pulseStartedRef.current = true;

    const { width: winW, height: winH } = Dimensions.get('window');
    const waveMaxScale = (Math.hypot(winW, winH) * 2.4) / WAVE_BASE;

    waveOpacity.setValue(0.9);
    waveScale.setValue(0.01);
    Animated.parallel([
      Animated.timing(waveScale, {
        toValue: waveMaxScale,
        duration: WAVE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(waveOpacity, {
        toValue: 0,
        duration: WAVE_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    revealTimeoutsRef.current.forEach(clearTimeout);
    revealTimeoutsRef.current = [];

    const finishIntro = setTimeout(() => {
      setIntroActive(false);
    }, WAVE_DURATION_MS + 450);
    revealTimeoutsRef.current.push(finishIntro);

    const uiDelay = WAVE_DURATION_MS + 300;
    const uiTid = setTimeout(() => {
      Animated.spring(legendSlide, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 7,
        speed: 11,
      }).start();
    }, uiDelay);
    revealTimeoutsRef.current.push(uiTid);
  }, []);

  useEffect(
    () => () => {
      revealTimeoutsRef.current.forEach(clearTimeout);
      revealTimeoutsRef.current = [];
    },
    [],
  );

  useEffect(() => {
    if (!introActive) return;
    if (!user || loading || error || shouldShowMapListInsteadOfMap()) return;
    const tid = setTimeout(() => runIntroPulse(), 800);
    return () => clearTimeout(tid);
  }, [user, loading, error, introActive, runIntroPulse]);

  const mapPolylines: MapPolyline[] = useMemo(() => {
    if (!selectedTransitId) return [];
    const r = transitRoutes.find((x) => x.id === selectedTransitId);
    if (!r?.path.length) return [];
    return [
      {
        id: 'transit-selected',
        coordinates: r.path.map((pt) => ({ latitude: pt.lat, longitude: pt.lng })),
        strokeColor: '#2563eb',
        strokeWidth: Platform.OS === 'web' ? 6 : 5,
      },
    ];
  }, [transitRoutes, selectedTransitId]);

  const selectedTransitRoute = useMemo(
    () => transitRoutes.find((x) => x.id === selectedTransitId),
    [transitRoutes, selectedTransitId],
  );

  const closeNewQuestModal = useCallback(() => {
    setNewQuestOpen(false);
    setNewQuestLat(null);
    setNewQuestLng(null);
    setNewQuestTitle('');
    setNewQuestDesc('');
    setNewQuestParticipants('1');
    setNewQuestError(null);
    setNewQuestRequireApproval(false);
  }, []);

  const onMapPress = useCallback(
    (coord: { latitude: number; longitude: number }) => {
      if (mapPickQuest) {
        setMapPickQuest(false);
        setNewQuestLat(coord.latitude);
        setNewQuestLng(coord.longitude);
        setNewQuestTitle('');
        setNewQuestDesc('');
        setNewQuestParticipants('1');
        setNewQuestError(null);
        setNewQuestRequireApproval(false);
        setNewQuestOpen(true);
        return;
      }
      if (mapPickTransit) {
        setMapPickTransit(false);
        void runTransitTo(coord.latitude, coord.longitude, 'Dropped pin');
      }
    },
    [mapPickQuest, mapPickTransit, runTransitTo],
  );

  const submitNewQuest = async () => {
    if (!user?.uid || newQuestLat == null || newQuestLng == null || !profile) return;
    const n = Math.min(100, Math.max(1, Math.floor(Number.parseInt(newQuestParticipants.trim(), 10) || 1)));
    setNewQuestError(null);
    setNewQuestSaving(true);
    try {
      const who =
        profile.username?.trim() ||
        user.email?.split('@')[0]?.trim() ||
        'Explorer';
      await createQuest(user.uid, who, {
        title: newQuestTitle,
        description: newQuestDesc,
        lat: newQuestLat,
        lng: newQuestLng,
        participantsRequired: n,
        requireHostApproval: newQuestRequireApproval,
      });
      closeNewQuestModal();
      await load();
      mapRef.current?.animateToRegion(
        {
          latitude: newQuestLat,
          longitude: newQuestLng,
          latitudeDelta: LOCAL_DELTA,
          longitudeDelta: LOCAL_DELTA,
        },
        400,
      );
      setLayerVisibility((prev) => ({ ...prev, quests: true }));
    } catch (e) {
      setNewQuestError(e instanceof Error ? e.message : 'Could not post quest. Check Firestore rules.');
    } finally {
      setNewQuestSaving(false);
    }
  };

  const saveExploreEventDetails = async () => {
    if (!exploreFetched || !('startTimeMs' in exploreFetched) || !user?.uid) return;
    const ev = exploreFetched;
    setExploreDetailSaving(true);
    setExploreDetailError(null);
    try {
      const dt = exploreEditDateText.trim();
      let startTimeMs: number | undefined;
      if (dt.length > 0) {
        const parsed = Date.parse(dt);
        if (Number.isNaN(parsed)) {
          setExploreDetailError('Could not read date & time. Use format like 2026-03-15T18:30');
          return;
        }
        startTimeMs = parsed;
      }
      await patchEventSupplementaryInfo(ev.id, {
        organizerName: exploreEditName,
        organizerEmail: exploreEditEmail,
        organizerPhone: exploreEditPhone,
        ...(startTimeMs !== undefined ? { startTimeMs } : {}),
      });
      await setEventBookmarked(user.uid, ev.id, true);
      setExploreFetched(await fetchEventById(ev.id));
      void load();
    } catch (e) {
      setExploreDetailError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setExploreDetailSaving(false);
    }
  };

  if (!isFirebaseConfigured()) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={tint} />
        <Text style={[styles.message, { color: Colors[colorScheme].text }]}>
          Firebase is not configured. Copy mobile/.env.example to mobile/.env and add your web app keys.
        </Text>
      </View>
    );
  }

  if (authInit) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={tint} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={[styles.message, { color: Colors[colorScheme].text }]}>
          Sign in to use the map. You should be redirected to the login screen automatically.
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[styles.message, { color: '#f87171' }]}>{error}</Text>
        <Text style={[styles.retry, { color: tint }]} onPress={() => void load()}>
          Tap to retry
        </Text>
      </View>
    );
  }

  if (shouldShowMapListInsteadOfMap()) {
    const hint =
      Platform.OS === 'web'
        ? 'Add GOOGLE_MAPS_API_KEY to City-Pulse/.env (restart Expo). For transit, add GOOGLE_MAPS_ROUTES_API_KEY (Directions API) or use one key with both APIs enabled. Allow your web origin on the browser key.'
        : Platform.OS === 'android'
          ? 'Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (or EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY) to mobile/.env, restart Expo, then rebuild if needed for a full map.'
          : 'On phones, open this app in Expo Go or a dev build — iOS shows Apple Maps; Android needs a Google Maps API key for tiles.';
    return (
      <ScrollView contentContainerStyle={styles.webBox}>
        <Text style={[styles.webTitle, { color: Colors[colorScheme].text }]}>
          {Platform.OS === 'web' ? 'Map (web)' : 'Map (list view)'}
        </Text>
        <Text style={[styles.message, { color: Colors[colorScheme].text }]}>{hint}</Text>
        <Text style={[styles.message, { color: Colors[colorScheme].text, marginTop: 8 }]}>
          Pins from Firestore:
        </Text>
        {pins.map((p) => (
          <View key={`${p.kind}-${p.id}`} style={styles.webRow}>
            <View style={[styles.dot, { backgroundColor: markerColor(p.kind) }]} />
            <Text style={{ color: Colors[colorScheme].text }}>
              <Text style={styles.bold}>{formatDisplayTitle(p.kind)}</Text> — {formatDisplayTitle(p.title)}
            </Text>
          </View>
        ))}
      </ScrollView>
    );
  }

  const chipBg = colorScheme === 'dark' ? '#1e293b' : '#fff';
  const chipText = Colors[colorScheme].text;
  /** Sit above layer (legend) chips so quest/transit FABs do not overlap. */
  const fabBottom = tabBarPad + 88;
  const hideMapFabs =
    mapPickTransit || mapPickQuest || transitPanelOpen || newQuestOpen;

  return (
    <View style={[styles.fill, { backgroundColor: Colors[colorScheme].background }]}>
      <MapCanvas
        ref={mapRef}
        style={styles.fill}
        initialRegion={NYC_FALLBACK}
        pins={visiblePins}
        polylines={mapPolylines}
        mapTheme={mapTheme}
        userLocation={
          userOrigin ? { latitude: userOrigin.lat, longitude: userOrigin.lng } : undefined
        }
        onPress={onMapPress}
      />

      {loading && pins.length === 0 ? (
        <View
          style={[styles.mapLoadingBanner, { top: 12 + insets.top }]}
          pointerEvents="none">
          <ActivityIndicator color={tint} />
          <Text style={[styles.mapLoadingTxt, { color: Colors[colorScheme].text }]}>
            Loading places…
          </Text>
        </View>
      ) : null}

      <View style={[StyleSheet.absoluteFill, styles.waveContainer]} pointerEvents="none">
        <Animated.View
          style={[
            styles.waveRing,
            {
              borderColor: INTRO_WAVE_COLOR,
              opacity: waveOpacity,
              transform: [{ scale: waveScale }],
            },
          ]}
        />
      </View>

      <MapFloatingActions
        topInset={insets.top}
        bottom={fabBottom}
        right={14}
        mapTheme={mapTheme}
        tint={tint}
        chipBg={chipBg}
        chipText={chipText}
        hidden={hideMapFabs}
        onToggleMapTheme={() => setMapTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onPressTransit={() => {
          setMapPickQuest(false);
          setMapPickTransit(true);
        }}
        onPressQuest={() => {
          setMapPickTransit(false);
          setMapPickQuest(true);
        }}
      />

      {mapPickQuest ? (
        <View style={[styles.pickHint, { backgroundColor: chipBg, top: 16 + insets.top }]}>
          <Text style={[styles.pickHintTxt, { color: chipText }]}>Tap the map to place the quest</Text>
          <Pressable onPress={() => setMapPickQuest(false)}>
            <Text style={{ color: tint, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </View>
      ) : mapPickTransit ? (
        <View style={[styles.pickHint, { backgroundColor: chipBg, top: 16 + insets.top }]}>
          <Text style={[styles.pickHintTxt, { color: chipText }]}>Tap the map to set destination</Text>
          <Pressable onPress={() => setMapPickTransit(false)}>
            <Text style={{ color: tint, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {transitPanelOpen ? (
        <View
          style={[
            styles.transitPanel,
            { bottom: tabBarPad + TRANSIT_PANEL_BOTTOM_OFFSET, backgroundColor: chipBg },
          ]}>
          <View style={styles.transitPanelHeader}>
            <Text style={[styles.transitPanelTitle, { color: chipText }]} numberOfLines={2}>
              {transitDirectionsError
                ? 'Transit'
                : transitDestLabel === 'Allow location to plan transit'
                  ? 'Location needed'
                  : transitDestLabel || 'Transit'}
            </Text>
            <Pressable
              onPress={() => {
                setTransitPanelOpen(false);
                setTransitRoutes([]);
                setSelectedTransitId(null);
                setTransitDirectionsError(null);
              }}>
              <Ionicons name="close" size={22} color={chipText} />
            </Pressable>
          </View>
          {transitLoading ? <ActivityIndicator color={tint} style={{ marginVertical: 8 }} /> : null}
          {!transitLoading && transitRoutes.length === 0 ? (
            <Text style={[styles.transitEmpty, { color: chipText }]}>
              {transitDestLabel === 'Allow location to plan transit'
                ? 'Turn on location for this app, then try again.'
                : transitDirectionsError ??
                  'No transit routes returned. Enable the Directions API (separate from Maps JavaScript API) and add it to this key’s API restrictions if the key is restricted.'}
            </Text>
          ) : null}
          <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {transitRoutes.map((r) => {
              const on = r.id === selectedTransitId;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    setSelectedTransitId(r.id);
                    mapRef.current?.animateToRegion(
                      {
                        latitude: r.path[Math.floor(r.path.length / 2)]?.lat ?? NYC_FALLBACK.latitude,
                        longitude: r.path[Math.floor(r.path.length / 2)]?.lng ?? NYC_FALLBACK.longitude,
                        latitudeDelta: 0.06,
                        longitudeDelta: 0.06,
                      },
                      400,
                    );
                  }}
                  style={[
                    styles.routeRow,
                    {
                      borderColor: on ? tint : colorScheme === 'dark' ? '#334155' : '#e2e8f0',
                      backgroundColor: on ? `${tint}18` : 'transparent',
                    },
                  ]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.routeSummary, { color: chipText }]} numberOfLines={2}>
                      {r.summary}
                    </Text>
                    <Text style={[styles.routeMeta, { color: chipText }]}>
                      {r.durationText}
                      {r.arrivalText ? ` · arr. ${r.arrivalText}` : ''}
                    </Text>
                    {on && r.segments.length > 0 ? (
                      <Text style={[styles.routeTapHint, { color: tint }]}>
                        Lines & stops below — walking vs transit
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.safetyPill}>
                    <Text style={styles.safetyNum}>{r.safetyScore}</Text>
                    <Text style={styles.safetyLbl}>safe</Text>
                  </View>
                </Pressable>
              );
            })}
            {selectedTransitRoute ? (
              <View style={styles.transitDetailBlock}>
                <Text style={[styles.transitDetailHeading, { color: chipText }]}>Itinerary</Text>
                <TransitItinerary
                  segments={selectedTransitRoute.segments}
                  textColor={chipText}
                  subtleColor={colorScheme === 'dark' ? '#94a3b8' : '#64748b'}
                  accentColor={tint}
                />
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.legendWrap,
          {
            bottom: tabBarPad + LEGEND_BOTTOM_PAD,
            transform: [{ translateY: legendSlide }],
          },
        ]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.legendScroll, { backgroundColor: chipBg }]}
          contentContainerStyle={styles.legendRow}>
        {ALL_MAP_LAYERS.map((layer) => {
          const on = layerVisibility[layer];
          const v = LAYER_VISUAL[layer];
          const labels: Record<MapMarkerLayer, string> = {
            events: 'Events',
            incidents: 'Safety',
            bathrooms: 'Restrooms',
            quests: 'Quests',
          };
          const layerIon =
            v.icon === 'flag'
              ? 'flag-outline'
              : v.icon === 'warning'
                ? 'warning-outline'
                : v.icon === 'water'
                  ? 'water-outline'
                  : 'calendar-outline';
          return (
            <Pressable
              key={layer}
              onPress={() => setLayerVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }))}
              style={[
                styles.layerChip,
                {
                  borderColor: v.color,
                  backgroundColor: on ? `${v.color}28` : 'transparent',
                  opacity: on ? 1 : 0.45,
                  minWidth: 112,
                },
              ]}>
              {layer === 'bathrooms' ? (
                <View style={[styles.layerBlueDot, { backgroundColor: v.color }]} />
              ) : (
                <Ionicons name={layerIon} size={14} color={v.color} />
              )}
              <Text style={[styles.layerChipTxt, { color: chipText }]}>{labels[layer]}</Text>
            </Pressable>
          );
        })}
        </ScrollView>
      </Animated.View>

      <Modal visible={newQuestOpen} transparent animationType="fade">
        <View style={[styles.modalBackdrop, Platform.OS === 'web' && styles.modalBackdropWeb]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.modalCard,
              { backgroundColor: chipBg },
              Platform.OS === 'web' && styles.modalCardWeb,
            ]}>
            <Text style={[styles.modalTitle, { color: chipText }]}>New quest</Text>
            <Text style={[styles.modalHint, { color: chipText }]}>
              Location comes from your map tap. Others can join until the group is full; the quest then leaves the map
              for new players.
            </Text>
            {newQuestLat != null && newQuestLng != null ? (
              <Text style={[styles.coordHint, { color: chipText }]}>
                {newQuestLat.toFixed(5)}, {newQuestLng.toFixed(5)}
              </Text>
            ) : null}
            <TextInput
              style={[
                styles.eventInput,
                { color: chipText, borderColor: colorScheme === 'dark' ? '#334155' : '#cbd5e1' },
              ]}
              placeholder="Quest title"
              placeholderTextColor="#94a3b8"
              value={newQuestTitle}
              onChangeText={setNewQuestTitle}
            />
            <TextInput
              style={[
                styles.eventInput,
                styles.eventInputMulti,
                { color: chipText, borderColor: colorScheme === 'dark' ? '#334155' : '#cbd5e1' },
              ]}
              placeholder="What should participants do?"
              placeholderTextColor="#94a3b8"
              value={newQuestDesc}
              onChangeText={setNewQuestDesc}
              multiline
            />
            <TextInput
              style={[
                styles.eventInput,
                { color: chipText, borderColor: colorScheme === 'dark' ? '#334155' : '#cbd5e1' },
              ]}
              placeholder="People needed (1–100)"
              placeholderTextColor="#94a3b8"
              value={newQuestParticipants}
              onChangeText={setNewQuestParticipants}
              keyboardType="number-pad"
            />
            <View style={styles.approvalRow}>
              <Text style={[styles.approvalLabel, { color: chipText }]}>
                Require your approval before someone joins
              </Text>
              <Switch
                value={newQuestRequireApproval}
                onValueChange={setNewQuestRequireApproval}
                trackColor={{ false: '#64748b', true: `${tint}99` }}
                thumbColor={newQuestRequireApproval ? tint : '#f1f5f9'}
              />
            </View>
            {newQuestError ? <Text style={styles.eventError}>{newQuestError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={closeNewQuestModal} disabled={newQuestSaving}>
                <Text style={{ color: chipText }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: tint, opacity: newQuestSaving ? 0.6 : 1 }]}
                disabled={newQuestSaving}
                onPress={() => void submitNewQuest()}>
                <Text style={styles.primaryBtnText}>{newQuestSaving ? 'Posting…' : 'Post quest'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={pickedQuest != null} transparent animationType="slide">
        <View style={[styles.modalBackdrop, Platform.OS === 'web' && styles.modalBackdropWeb]}>
          <View style={[styles.modalCard, { backgroundColor: chipBg }, Platform.OS === 'web' && styles.modalCardWeb]}>
            {pickedQuest ? (
              <>
                <Text style={[styles.modalTitle, { color: chipText }]}>{pickedQuest.title}</Text>
                <Text style={[styles.modalHint, { color: chipText }]}>
                  By @{pickedQuest.authorUsername} · {pickedQuest.participantIds.length}/
                  {pickedQuest.participantsRequired} confirmed
                  {pickedQuest.requireHostApproval && pickedQuest.pendingParticipantIds.length > 0
                    ? ` · ${pickedQuest.pendingParticipantIds.length} waiting for approval`
                    : ''}
                  {pickedQuest.participantsRequired > 1 ? ' (quest fills when full)' : ''}
                </Text>
                <Text style={[styles.body, { color: chipText }]}>{pickedQuest.description}</Text>
                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.secondaryBtn, { borderColor: tint }]}
                    disabled={questBusy}
                    onPress={() => {
                      if (user?.uid && pickedQuest) void denyQuest(user.uid, pickedQuest.id);
                      setPickedQuest(null);
                    }}>
                    <Text style={{ color: tint }}>Hide for me</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: tint, opacity: questBusy ? 0.6 : 1 }]}
                    disabled={questBusy}
                    onPress={() => {
                      if (!user?.uid || !pickedQuest || !profile) return;
                      setQuestBusy(true);
                      void (async () => {
                        try {
                          const who =
                            profile.username?.trim() ||
                            user.email?.split('@')[0]?.trim() ||
                            'Participant';
                          await acceptQuest(user.uid, who, pickedQuest);
                          setPickedQuest(null);
                        } catch {
                          /* full or rules */
                        } finally {
                          setQuestBusy(false);
                        }
                      })();
                    }}>
                    <Text style={styles.primaryBtnText}>Join quest</Text>
                  </Pressable>
                </View>
                <Pressable style={styles.linkBtn} onPress={() => setPickedQuest(null)}>
                  <Text style={{ color: chipText }}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={explorePin != null} transparent animationType="slide">
        <View style={[styles.modalBackdrop, Platform.OS === 'web' && styles.modalBackdropWeb]}>
          <ScrollView
            style={{ maxHeight: '88%' }}
            contentContainerStyle={[
              styles.modalCard,
              { backgroundColor: chipBg },
              Platform.OS === 'web' && styles.modalCardWeb,
            ]}>
            {explorePin ? (
              <>
                <Text style={[styles.modalTitle, { color: chipText }]}>
                  {formatDisplayTitle(
                    exploreFetched && 'title' in exploreFetched && exploreFetched.title
                      ? exploreFetched.title
                      : explorePin.title,
                  )}
                </Text>
                {exploreLoading ? <ActivityIndicator color={tint} style={{ marginVertical: 12 }} /> : null}
                {exploreFetched && 'description' in exploreFetched && exploreFetched.description ? (
                  <Text style={[styles.body, { color: chipText }]}>{exploreFetched.description}</Text>
                ) : explorePin.description ? (
                  <Text style={[styles.body, { color: chipText }]}>{explorePin.description}</Text>
                ) : null}
                {exploreFetched && 'imageUrl' in exploreFetched && exploreFetched.imageUrl ? (
                  <Image source={{ uri: exploreFetched.imageUrl }} style={styles.detailImage} resizeMode="cover" />
                ) : null}
                {exploreFetched && 'photoUrl' in exploreFetched && exploreFetched.photoUrl ? (
                  <Image source={{ uri: exploreFetched.photoUrl }} style={styles.detailImage} resizeMode="cover" />
                ) : null}
                {exploreFetched && 'startTimeMs' in exploreFetched ? (
                  <GeminiEventInsights
                    key={exploreFetched.id}
                    event={exploreFetched}
                    tint={tint}
                    textColor={chipText}
                    subtleColor={chipText}
                    context="map"
                  />
                ) : null}
                {exploreFetched && 'startTimeMs' in exploreFetched ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.modalHint, { color: chipText }]}>
                      <Text style={{ fontWeight: '700' }}>When: </Text>
                      {exploreFetched.startTimeMs > 0
                        ? new Date(exploreFetched.startTimeMs).toLocaleString()
                        : 'Date & time not set'}
                    </Text>
                    <Text style={[styles.modalHint, { color: chipText, marginTop: 8 }]}>
                      <Text style={{ fontWeight: '700' }}>Organizer: </Text>
                      {exploreFetched.organizerName?.trim()
                        ? exploreFetched.organizerName.trim()
                        : 'Not listed'}
                    </Text>
                    {exploreFetched.organizerEmail || exploreFetched.organizerPhone ? (
                      <View style={{ gap: 6, marginTop: 8 }}>
                        {exploreFetched.organizerEmail ? (
                          <Pressable
                            onPress={() =>
                              void Linking.openURL(`mailto:${exploreFetched.organizerEmail}`)
                            }>
                            <Text style={{ color: tint, fontWeight: '600' }}>
                              Email: {exploreFetched.organizerEmail}
                            </Text>
                          </Pressable>
                        ) : null}
                        {exploreFetched.organizerPhone ? (
                          <Pressable
                            onPress={() =>
                              void Linking.openURL(`tel:${exploreFetched.organizerPhone}`)
                            }>
                            <Text style={{ color: tint, fontWeight: '600' }}>
                              Phone: {exploreFetched.organizerPhone}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={[styles.modalHint, { color: chipText, marginTop: 6 }]}>
                        No organizer email or phone on file.
                      </Text>
                    )}
                  </View>
                ) : null}
                {exploreFetched && 'startTimeMs' in exploreFetched && user?.uid ? (
                  <View style={{ marginTop: 16, gap: 10 }}>
                    <Text style={[styles.modalHint, { color: chipText, fontWeight: '700' }]}>
                      Add or correct details
                    </Text>
                    <Text style={[styles.coordHint, { color: chipText }]}>
                      Date & time (optional): e.g. 2026-03-15T18:30. Leave empty to keep the stored time when you only
                      update contacts.
                    </Text>
                    <TextInput
                      style={[
                        styles.eventInput,
                        { color: chipText, borderColor: colorScheme === 'dark' ? '#334155' : '#cbd5e1' },
                      ]}
                      placeholder="2026-03-15T18:30"
                      placeholderTextColor="#94a3b8"
                      value={exploreEditDateText}
                      onChangeText={setExploreEditDateText}
                    />
                    <TextInput
                      style={[
                        styles.eventInput,
                        { color: chipText, borderColor: colorScheme === 'dark' ? '#334155' : '#cbd5e1' },
                      ]}
                      placeholder="Organizer name"
                      placeholderTextColor="#94a3b8"
                      value={exploreEditName}
                      onChangeText={setExploreEditName}
                    />
                    <TextInput
                      style={[
                        styles.eventInput,
                        { color: chipText, borderColor: colorScheme === 'dark' ? '#334155' : '#cbd5e1' },
                      ]}
                      placeholder="Organizer email"
                      placeholderTextColor="#94a3b8"
                      value={exploreEditEmail}
                      onChangeText={setExploreEditEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <TextInput
                      style={[
                        styles.eventInput,
                        { color: chipText, borderColor: colorScheme === 'dark' ? '#334155' : '#cbd5e1' },
                      ]}
                      placeholder="Organizer phone"
                      placeholderTextColor="#94a3b8"
                      value={exploreEditPhone}
                      onChangeText={setExploreEditPhone}
                      keyboardType="phone-pad"
                    />
                    {exploreDetailError ? <Text style={styles.eventError}>{exploreDetailError}</Text> : null}
                    <Pressable
                      style={[
                        styles.primaryBtn,
                        { backgroundColor: tint, opacity: exploreDetailSaving ? 0.6 : 1 },
                      ]}
                      disabled={exploreDetailSaving}
                      onPress={() => void saveExploreEventDetails()}>
                      <Text style={styles.primaryBtnText}>
                        {exploreDetailSaving ? 'Saving…' : 'Save details'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {exploreFetched && 'startTimeMs' in exploreFetched && user?.uid ? (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    {exploreRsvpError ? (
                      <Text style={styles.eventError}>{exploreRsvpError}</Text>
                    ) : null}
                    <Pressable
                      style={[styles.secondaryBtn, { borderColor: tint }]}
                      onPress={async () => {
                        const ev = exploreFetched;
                        if (!('startTimeMs' in ev) || !user?.uid) return;
                        setExploreRsvpError(null);
                        try {
                          if (eventRsvp) {
                            await cancelEventSignup(user.uid, ev.id);
                            setEventRsvp(false);
                          } else {
                            await signUpForEvent(user.uid, ev.id);
                            setEventRsvp(true);
                          }
                        } catch (e) {
                          setExploreRsvpError(
                            e instanceof Error ? e.message : 'Could not update RSVP. Check Firestore rules.',
                          );
                        }
                      }}>
                      <Text style={{ color: tint }}>{eventRsvp ? 'Cancel RSVP' : 'Sign up / RSVP'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  style={[styles.secondaryBtn, { borderColor: tint, marginTop: 12 }]}
                  onPress={() => {
                    void runTransitTo(explorePin.latitude, explorePin.longitude, explorePin.title);
                    setExplorePin(null);
                    setExploreFetched(null);
                  }}>
                  <Text style={{ color: tint }}>Transit routes here</Text>
                </Pressable>
                <Pressable
                  style={styles.linkBtn}
                  onPress={() => {
                    setExplorePin(null);
                    setExploreFetched(null);
                  }}>
                  <Text style={{ color: chipText }}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  mapLoadingBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    zIndex: 20,
  },
  mapLoadingTxt: { fontSize: 13, fontWeight: '600', opacity: 0.9, marginLeft: 10 },
  waveContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  waveRing: {
    width: WAVE_BASE,
    height: WAVE_BASE,
    borderRadius: WAVE_BASE / 2,
    borderWidth: 8,
    backgroundColor: 'transparent',
  },
  legendWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
    maxHeight: 56,
    zIndex: 7,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { marginTop: 16, textAlign: 'center', fontSize: 16, lineHeight: 22 },
  hint: { marginTop: 12 },
  retry: { marginTop: 20, fontSize: 16, fontWeight: '600' },
  transitPanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    borderRadius: 14,
    padding: 12,
    maxHeight: 240,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 8,
  },
  transitPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  transitPanelTitle: { flex: 1, fontSize: 15, fontWeight: '800', marginRight: 8 },
  transitEmpty: { fontSize: 13, marginBottom: 8, opacity: 0.9 },
  transitErrorDetail: { opacity: 1, lineHeight: 20, fontSize: 13 },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  routeSummary: { fontSize: 13, fontWeight: '700' },
  routeMeta: { fontSize: 12, opacity: 0.85, marginTop: 2 },
  routeTapHint: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  transitDetailBlock: { paddingTop: 10, paddingBottom: 8 },
  transitDetailHeading: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  safetyPill: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(34,197,94,0.2)',
  },
  safetyNum: { fontSize: 16, fontWeight: '800', color: '#22c55e' },
  safetyLbl: { fontSize: 9, fontWeight: '700', color: '#15803d', textTransform: 'uppercase' },
  legendScroll: {
    borderRadius: 12,
    paddingVertical: 6,
    maxHeight: 56,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 44,
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    marginRight: 8,
  },
  layerBlueDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  layerChipTxt: { fontSize: 11, fontWeight: '700' },
  detailImage: { width: '100%', height: 180, borderRadius: 12, marginTop: 12, backgroundColor: '#334155' },
  pickHint: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 11,
  },
  pickHintTxt: { flex: 1, fontSize: 14, fontWeight: '600' },
  webBox: { padding: 20 },
  webTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  webRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bold: { fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBackdropWeb: {
    alignItems: 'center',
  },
  modalCard: { borderRadius: 16, padding: 18 },
  modalCardWeb: {
    maxWidth: 480,
    width: '100%',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  modalHint: { fontSize: 14, lineHeight: 20, marginBottom: 10, opacity: 0.9 },
  coordHint: { fontSize: 12, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), marginBottom: 12, opacity: 0.85 },
  eventInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  eventInputMulti: { minHeight: 88, textAlignVertical: 'top' },
  eventError: { color: '#f87171', fontSize: 14, marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  linkBtn: { marginTop: 12 },
  approvalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    paddingVertical: 4,
  },
  approvalLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  primaryBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2 },
});
