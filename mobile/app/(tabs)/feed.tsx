import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Colors from '@/constants/Colors';
import { webScreenInner, webScreenOuter } from '@/constants/webLayout';
import { FOR_YOU_LOADING_GIF } from '@/constants/feedAssets';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/contexts/AuthContext';
import { useMapFocus } from '@/contexts/MapFocusContext';
import { extractFirstUrl } from '@/lib/extractUrl';
import { fetchLinkPreview, type LinkPreview } from '@/lib/fetchLinkPreview';
import {
  fetchCommunityPostById,
  fetchEventById,
  fetchFeedItems,
  fetchIncidentLatLngById,
  fetchIncidents,
  fetchTransitAlertLatLngById,
  getNycMapFallback,
  type CommunityPostDetail,
  type EventDetail,
  type FeedItem,
  type IncidentRow,
} from '@/lib/firestoreFeed';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  getEventInterestCount,
  isEventBookmarked,
  isUserInterestedInEvent,
  setEventBookmarked,
  setUserInterestedInEvent,
  fetchUserBookmarkedEvents,
  type BookmarkedEventSummary,
} from '@/lib/eventEngagement';
import { fetchCityNews, type CityNewsItem } from '@/lib/newsService';
import { fetchRecommendedEvents, formatCategoryForDisplay, type RecommendedEvent } from '@/lib/recommendEvents';
import { GeminiEventInsights } from '@/components/GeminiEventInsights';
import { useFloatingTabBarPadding } from '@/hooks/useFloatingTabBarPadding';

type FeedMode = 'recommended' | 'all' | 'security' | 'news' | 'bookmarked';

export default function FeedScreen() {
  const router = useRouter();
  const { requestMapFocus } = useMapFocus();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const tabBarPad = useFloatingTabBarPadding();
  const listContentStyle = useMemo(
    () => [styles.list, { paddingBottom: tabBarPad }],
    [tabBarPad],
  );
  const { user, profile } = useAuth();
  const [mode, setMode] = useState<FeedMode>('all');
  const [menuOpen, setMenuOpen] = useState(false);

  const [items, setItems] = useState<FeedItem[]>([]);
  const [incidentRows, setIncidentRows] = useState<IncidentRow[]>([]);
  const [recommended, setRecommended] = useState<RecommendedEvent[]>([]);
  const [news, setNews] = useState<CityNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [readOpen, setReadOpen] = useState(false);
  const [readLoading, setReadLoading] = useState(false);
  const [readEvent, setReadEvent] = useState<EventDetail | null>(null);
  const [readCommunity, setReadCommunity] = useState<CommunityPostDetail | null>(null);
  const [readFallbackTitle, setReadFallbackTitle] = useState('');
  const [readFallbackBody, setReadFallbackBody] = useState('');
  const [newsRead, setNewsRead] = useState<CityNewsItem | null>(null);
  const [readPreview, setReadPreview] = useState<LinkPreview | null>(null);
  const [newsPreview, setNewsPreview] = useState<LinkPreview | null>(null);

  const [bookmarkedList, setBookmarkedList] = useState<BookmarkedEventSummary[]>([]);
  const [modalInterested, setModalInterested] = useState(false);
  const [modalBookmarked, setModalBookmarked] = useState(false);
  const [interestBusy, setInterestBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setError('Configure Firebase in mobile/.env');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [all, n, inc] = await Promise.all([
        fetchFeedItems(24),
        fetchCityNews(24),
        fetchIncidents(40),
      ]);
      setItems(all);
      setIncidentRows(inc);
      setNews(n);

      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {
        /* optional location */
      }
      const prefs = profile?.preferences ?? [];
      const rec = await fetchRecommendedEvents(prefs, lat, lng, 30);
      setRecommended(rec);

      if (user?.uid) {
        setBookmarkedList(await fetchUserBookmarkedEvents(user.uid));
      } else {
        setBookmarkedList([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [profile?.preferences, user?.uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const activityItems = useMemo(
    () => items.filter((i) => i.kind === 'event' || i.kind === 'community'),
    [items],
  );

  const transitAlerts = useMemo(() => items.filter((i) => i.kind === 'alert'), [items]);

  type SecurityRow =
    | { rowType: 'alert'; feed: FeedItem }
    | { rowType: 'incident'; inc: IncidentRow };

  const securitySections = useMemo(() => {
    const alertRows: SecurityRow[] = transitAlerts.map((feed) => ({ rowType: 'alert', feed }));
    const incRows: SecurityRow[] = incidentRows.map((inc) => ({ rowType: 'incident', inc }));
    return [
      { title: 'Transit & service alerts' as const, data: alertRows },
      { title: 'Safety incidents' as const, data: incRows },
    ];
  }, [transitAlerts, incidentRows]);

  const goToEventOnMap = async (eventId: string) => {
    const ev = await fetchEventById(eventId);
    if (!ev) return;
    requestMapFocus({ lat: ev.lat, lng: ev.lng, focusPinId: `event-${eventId}` });
    router.navigate('/(tabs)');
  };

  const goToCommunityOnMap = async (postId: string) => {
    const c = await fetchCommunityPostById(postId);
    if (!c) return;
    requestMapFocus({ lat: c.lat, lng: c.lng });
    router.navigate('/(tabs)');
  };

  const goToIncidentOnMap = async (inc: IncidentRow) => {
    let lat = inc.lat;
    let lng = inc.lng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      const coords = await fetchIncidentLatLngById(inc.id);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }
    let focusPinId: string | undefined = `incident-${inc.id}`;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      const fb = getNycMapFallback();
      lat = fb.lat;
      lng = fb.lng;
      focusPinId = undefined;
    }
    requestMapFocus({ lat, lng, focusPinId });
    router.navigate('/(tabs)');
  };

  const goToTransitAlertOnMap = async (alertId: string) => {
    let coords = await fetchTransitAlertLatLngById(alertId);
    if (!coords) coords = getNycMapFallback();
    requestMapFocus({ lat: coords.lat, lng: coords.lng });
    router.navigate('/(tabs)');
  };

  useEffect(() => {
    if (!readEvent?.id || !user?.uid) {
      setModalInterested(false);
      setModalBookmarked(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [intr, bm] = await Promise.all([
        isUserInterestedInEvent(readEvent.id, user.uid),
        isEventBookmarked(user.uid, readEvent.id),
      ]);
      if (!cancelled) {
        setModalInterested(intr);
        setModalBookmarked(bm);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readEvent?.id, user?.uid]);

  const closeReadModal = useCallback(() => {
    setReadPreview(null);
    setReadOpen(false);
    setReadEvent(null);
    setReadCommunity(null);
    setReadFallbackTitle('');
    setReadFallbackBody('');
  }, []);

  const openFeedMenu = useCallback(() => {
    setNewsRead(null);
    setNewsPreview(null);
    closeReadModal();
    setMenuOpen(true);
  }, [closeReadModal]);

  const openCityNewsDetail = useCallback(
    (item: CityNewsItem) => {
      setMenuOpen(false);
      closeReadModal();
      setNewsRead(item);
    },
    [closeReadModal],
  );

  useEffect(() => {
    if (!newsRead?.link) {
      setNewsPreview(null);
      return;
    }
    let cancelled = false;
    void fetchLinkPreview(newsRead.link).then((p) => {
      if (!cancelled) setNewsPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [newsRead]);

  if (!isFirebaseConfigured()) {
    return (
      <View style={styles.center}>
        <Text style={{ color: Colors[colorScheme].text, textAlign: 'center' }}>
          Add EXPO_PUBLIC_FIREBASE_* variables to mobile/.env
        </Text>
      </View>
    );
  }

  const modeLabel =
    mode === 'recommended'
      ? 'For you'
      : mode === 'all'
        ? 'All activity'
        : mode === 'security'
          ? 'Security feed'
          : mode === 'bookmarked'
            ? 'Bookmarks'
            : 'City news';

  const listShell = (child: ReactNode) => (
    <View style={styles.listShell}>{child}</View>
  );

  return (
    <View style={[styles.fill, webScreenOuter, { backgroundColor: Colors[colorScheme].background }]}>
      <View style={[webScreenInner, styles.feedInner]}>
      <View style={styles.topBar}>
        <Text style={[styles.header, { color: Colors[colorScheme].text }]}>Feed</Text>
        <Pressable style={[styles.menuBtn, { borderColor: tint }]} onPress={openFeedMenu}>
          <Text style={{ color: tint, fontWeight: '700' }}>{modeLabel} ▾</Text>
        </Pressable>
      </View>

      <Modal visible={menuOpen && !readOpen && newsRead == null} transparent animationType="fade">
        <Pressable style={[styles.menuBackdrop, Platform.OS === 'web' && styles.menuBackdropWeb]} onPress={() => setMenuOpen(false)}>
          <View
            style={[
              styles.menuCard,
              { backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#fff' },
              Platform.OS === 'web' && styles.menuCardWeb,
            ]}>
            {(['recommended', 'all', 'security', 'bookmarked', 'news'] as const).map((m) => (
              <Pressable
                key={m}
                style={styles.menuRow}
                onPress={() => {
                  setMode(m);
                  setMenuOpen(false);
                }}>
                <Text style={{ color: Colors[colorScheme].text, fontSize: 17 }}>
                  {m === 'recommended'
                    ? 'Recommended for you'
                    : m === 'all'
                      ? 'All activity'
                      : m === 'security'
                        ? 'Security feed'
                        : m === 'bookmarked'
                          ? 'Bookmarked events'
                          : 'City news'}
                </Text>
                {mode === m ? <Ionicons name="checkmark" size={20} color={tint} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={readOpen && newsRead == null} transparent animationType="slide">
        <Pressable
          style={[styles.readBackdrop, Platform.OS === 'web' && styles.readBackdropWeb]}
          onPress={closeReadModal}>
          <Pressable
            style={[styles.readCard, { backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#fff' }]}
            onPress={(e) => e.stopPropagation()}>
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={styles.readScroll}>
            <View style={styles.readModalHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close event"
                hitSlop={12}
                style={styles.readCloseIconWrap}
                onPress={closeReadModal}>
                <Ionicons name="close-circle" size={30} color={Colors[colorScheme].text} />
              </Pressable>
            </View>
            {readLoading ? <ActivityIndicator color={tint} style={{ marginVertical: 16 }} /> : null}
            <Text style={[styles.readTitle, { color: Colors[colorScheme].text }]}>
              {readPreview?.title ?? readEvent?.title ?? readCommunity?.title ?? readFallbackTitle}
            </Text>
            <Text style={[styles.readBody, { color: Colors[colorScheme].text }]}>
              {readPreview?.description && readPreview.description.length > (readFallbackBody?.length ?? 0)
                ? readPreview.description
                : readEvent?.description ?? readCommunity?.description ?? readFallbackBody}
            </Text>
            {readEvent?.imageUrl ? (
              <Image source={{ uri: readEvent.imageUrl }} style={styles.readImage} resizeMode="cover" />
            ) : readCommunity?.imageUrl ? (
              <Image source={{ uri: readCommunity.imageUrl }} style={styles.readImage} resizeMode="cover" />
            ) : readPreview?.imageUrl ? (
              <Image source={{ uri: readPreview.imageUrl }} style={styles.readImage} resizeMode="cover" />
            ) : null}
            {readEvent ? (
              <View style={{ marginTop: 0 }}>
                <GeminiEventInsights
                  key={readEvent.id}
                  event={readEvent}
                  tint={tint}
                  textColor={Colors[colorScheme].text}
                  subtleColor={Colors[colorScheme].text}
                  context="feed"
                />
                <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={[styles.readMeta, { color: Colors[colorScheme].text }]}>
                  {readEvent.startTimeMs
                    ? new Date(readEvent.startTimeMs).toLocaleString()
                    : 'Date TBA'}
                </Text>
                {readEvent.organizerName?.trim() ? (
                  <Text style={[styles.readMeta, { color: Colors[colorScheme].text }]}>
                    Organizer: {readEvent.organizerName.trim()}
                  </Text>
                ) : null}
                {readEvent.organizerEmail || readEvent.organizerPhone ? (
                  <View style={{ gap: 6 }}>
                    {readEvent.organizerEmail ? (
                      <Pressable
                        onPress={() => void Linking.openURL(`mailto:${readEvent.organizerEmail}`)}>
                        <Text style={{ color: tint, fontWeight: '600' }}>
                          Email organizer: {readEvent.organizerEmail}
                        </Text>
                      </Pressable>
                    ) : null}
                    {readEvent.organizerPhone ? (
                      <Pressable
                        onPress={() => void Linking.openURL(`tel:${readEvent.organizerPhone}`)}>
                        <Text style={{ color: tint, fontWeight: '600' }}>
                          Call: {readEvent.organizerPhone}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : !readEvent.organizerName?.trim() ? (
                  <Text style={[styles.readMeta, { color: Colors[colorScheme].text }]}>
                    Organizer contact not listed for this event.
                  </Text>
                ) : null}
                <Text style={[styles.readMeta, { color: Colors[colorScheme].text }]}>
                  {readEvent.interestCount ?? 0} interested
                </Text>
                {user?.uid ? (
                  <View style={{ gap: 8 }}>
                    <Pressable
                      style={[styles.readActionBtn, { borderColor: tint, opacity: interestBusy ? 0.6 : 1 }]}
                      disabled={interestBusy}
                      onPress={() => {
                        if (!readEvent?.id || !user.uid) return;
                        setInterestBusy(true);
                        void (async () => {
                          try {
                            const next = !modalInterested;
                            await setUserInterestedInEvent(readEvent.id, user.uid, next);
                            setModalInterested(next);
                            const c = await getEventInterestCount(readEvent.id);
                            setReadEvent((prev) => (prev ? { ...prev, interestCount: c } : prev));
                          } finally {
                            setInterestBusy(false);
                          }
                        })();
                      }}>
                      <Text style={{ color: tint, fontWeight: '700' }}>
                        {modalInterested ? 'Interested ✓' : 'Interested'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.readActionBtn, { borderColor: tint }]}
                      onPress={() => {
                        if (!readEvent?.id || !user.uid) return;
                        void (async () => {
                          const next = !modalBookmarked;
                          await setEventBookmarked(user.uid, readEvent.id, next);
                          setModalBookmarked(next);
                          if (user.uid) setBookmarkedList(await fetchUserBookmarkedEvents(user.uid));
                        })();
                      }}>
                      <Text style={{ color: tint, fontWeight: '700' }}>
                        {modalBookmarked ? 'Bookmarked ✓' : 'Bookmark'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                </View>
              </View>
            ) : null}
            <Pressable style={styles.readClose} onPress={closeReadModal}>
              <Text style={{ color: tint, fontWeight: '700' }}>Close</Text>
            </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={newsRead != null && !readOpen} transparent animationType="slide">
        <Pressable
          style={[styles.readBackdrop, Platform.OS === 'web' && styles.readBackdropWeb]}
          onPress={() => {
            setNewsRead(null);
            setNewsPreview(null);
          }}>
          <Pressable
            style={[
              styles.readCard,
              { backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#fff' },
              Platform.OS === 'web' && styles.readCardWeb,
            ]}
            onPress={(e) => e.stopPropagation()}>
            {newsRead ? (
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                style={styles.readScroll}>
                <Text style={[styles.readTitle, { color: Colors[colorScheme].text }]}>
                  {newsPreview?.title ?? newsRead.headline}
                </Text>
                {newsRead.placeLabel ? (
                  <Text style={[styles.newsPlaceModal, { color: tint }]}>{newsRead.placeLabel}</Text>
                ) : null}
                {newsRead.imageUrl ? (
                  <Image
                    source={{ uri: newsRead.imageUrl }}
                    style={styles.readImage}
                    resizeMode="cover"
                  />
                ) : newsPreview?.imageUrl ? (
                  <Image
                    source={{ uri: newsPreview.imageUrl }}
                    style={styles.readImage}
                    resizeMode="cover"
                  />
                ) : null}
                <Text style={[styles.readBody, { color: Colors[colorScheme].text }]}>
                  {(() => {
                    const body =
                      newsRead.description?.trim() ||
                      (newsPreview?.description &&
                      newsPreview.description.length > (newsRead.summary?.length ?? 0)
                        ? newsPreview.description
                        : newsRead.summary);
                    return body;
                  })()}
                </Text>
                {newsRead.link ? (
                  <Pressable
                    style={styles.readClose}
                    onPress={() => void Linking.openURL(newsRead.link)}>
                    <Text style={{ color: tint, fontWeight: '700' }}>Open full article</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.readClose}
                  onPress={() => {
                    setNewsRead(null);
                    setNewsPreview(null);
                  }}>
                  <Text style={{ color: Colors[colorScheme].text }}>Close</Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {mode === 'recommended' && loading && recommended.length === 0 ? (
        <View style={styles.center}>
          <Image source={{ uri: FOR_YOU_LOADING_GIF }} style={styles.forYouLoadingGif} />
        </View>
      ) : loading && recommended.length === 0 && items.length === 0 && news.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tint} />
        </View>
      ) : mode === 'recommended' ? (
        listShell(
          <FlatList
            data={recommended}
            keyExtractor={(it) => it.id}
            style={styles.flatList}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: Colors[colorScheme].text }]}>
                {error ?? 'No events yet. Set interests in Profile and seed Firestore events.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void goToEventOnMap(item.id)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f8fafc',
                    borderColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0',
                  },
                ]}>
                <Text style={[styles.title, { color: Colors[colorScheme].text }]}>{item.title}</Text>
                <Text style={[styles.readMeta, { color: Colors[colorScheme].text }]}>
                  {item.startTimeMs ? new Date(item.startTimeMs).toLocaleString() : ''}
                </Text>
                {(() => {
                  const catLine = formatCategoryForDisplay(item.category);
                  const body = [catLine, item.subtitle].filter((s) => s && s.trim().length > 0);
                  if (body.length === 0) return null;
                  return (
                    <Text style={[styles.sub, { color: Colors[colorScheme].text }]} numberOfLines={6}>
                      {body.join('\n\n')}
                    </Text>
                  );
                })()}
                <Text style={[styles.learnMore, { color: tint }]}>Learn more</Text>
                {item.distanceKm != null ? (
                  <Text style={[styles.dist, { color: Colors[colorScheme].text }]}>
                    ~{item.distanceKm.toFixed(1)} km away
                  </Text>
                ) : (
                  <Text style={[styles.dist, { color: Colors[colorScheme].text }]}>Distance: enable location</Text>
                )}
              </Pressable>
            )}
            contentContainerStyle={listContentStyle}
          />,
        )
      ) : mode === 'all' ? (
        listShell(
          <FlatList
            data={activityItems}
            keyExtractor={(it) => `${it.kind}-${it.id}`}
            style={styles.flatList}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: Colors[colorScheme].text }]}>
                {error ?? 'No items yet.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  if (item.kind === 'alert') {
                    setMenuOpen(false);
                    setNewsRead(null);
                    setNewsPreview(null);
                    setReadLoading(false);
                    setReadOpen(true);
                    setReadEvent(null);
                    setReadCommunity(null);
                    setReadFallbackTitle(item.title);
                    setReadFallbackBody(item.subtitle ?? '');
                    return;
                  }
                  if (item.kind === 'event') {
                    void goToEventOnMap(item.id);
                    return;
                  }
                  void goToCommunityOnMap(item.id);
                }}
                style={[
                  styles.card,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f8fafc',
                    borderColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0',
                  },
                ]}>
                <Text style={[styles.title, { color: Colors[colorScheme].text }]}>{item.title}</Text>
                {item.subtitle ? (
                  <Text style={[styles.sub, { color: Colors[colorScheme].text }]} numberOfLines={3}>
                    {item.subtitle}
                  </Text>
                ) : null}
                {item.kind !== 'alert' ? (
                  <Text style={[styles.learnMore, { color: tint }]}>Learn more</Text>
                ) : null}
              </Pressable>
            )}
            contentContainerStyle={listContentStyle}
          />,
        )
      ) : mode === 'security' ? (
        listShell(
          <SectionList<SecurityRow>
            sections={securitySections}
            keyExtractor={(item) =>
              item.rowType === 'alert' ? `alert-${item.feed.id}` : `incident-${item.inc.id}`
            }
            style={styles.flatList}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            renderSectionHeader={({ section: { title } }) => (
              <Text style={[styles.sectionHeader, { color: Colors[colorScheme].text }]}>{title}</Text>
            )}
            renderItem={({ item }) =>
              item.rowType === 'alert' ? (
                <Pressable
                  onPress={() => void goToTransitAlertOnMap(item.feed.id)}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f8fafc',
                      borderColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0',
                    },
                  ]}>
                  <Text style={[styles.badge, { color: '#f59e0b' }]}>Alert</Text>
                  <Text style={[styles.title, { color: Colors[colorScheme].text }]}>{item.feed.title}</Text>
                  {item.feed.subtitle ? (
                    <Text style={[styles.sub, { color: Colors[colorScheme].text }]} numberOfLines={4}>
                      {item.feed.subtitle}
                    </Text>
                  ) : null}
                  <Text style={[styles.learnMore, { color: tint }]}>View on map</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void goToIncidentOnMap(item.inc)}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colorScheme === 'dark' ? '#2a1515' : '#fff7f7',
                      borderColor: colorScheme === 'dark' ? '#7f1d1d' : '#fecaca',
                    },
                  ]}>
                  <Text style={[styles.badge, { color: '#b91c1c' }]}>Incident</Text>
                  <Text style={[styles.title, { color: Colors[colorScheme].text }]}>{item.inc.type}</Text>
                  <Text style={[styles.sub, { color: Colors[colorScheme].text }]} numberOfLines={4}>
                    {item.inc.description ?? '—'}
                  </Text>
                  <Text style={[styles.readMeta, { color: Colors[colorScheme].text }]}>
                    {item.inc.timestamp ? new Date(item.inc.timestamp).toLocaleString() : ''}
                  </Text>
                  <Text style={[styles.learnMore, { color: tint }]}>View on map</Text>
                </Pressable>
              )
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: Colors[colorScheme].text }]}>
                {error ?? 'No security items yet.'}
              </Text>
            }
            contentContainerStyle={listContentStyle}
          />,
        )
      ) : mode === 'bookmarked' ? (
        listShell(
          <FlatList
            data={bookmarkedList}
            keyExtractor={(it) => it.eventId}
            style={styles.flatList}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: Colors[colorScheme].text }]}>
                {!user?.uid
                  ? 'Sign in to bookmark events.'
                  : error ?? 'No bookmarks yet. Open an event and tap Bookmark.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void goToEventOnMap(item.eventId)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f8fafc',
                    borderColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0',
                  },
                ]}>
                <Text style={[styles.title, { color: Colors[colorScheme].text }]}>{item.title}</Text>
                <Text style={[styles.sub, { color: Colors[colorScheme].text }]}>
                  {item.startTimeMs ? new Date(item.startTimeMs).toLocaleString() : ''}
                </Text>
                <Text style={[styles.learnMore, { color: tint }]}>Open</Text>
              </Pressable>
            )}
            contentContainerStyle={listContentStyle}
          />,
        )
      ) : (
        listShell(
          <FlatList
            data={news}
            keyExtractor={(it) => it.link || it.id}
            style={styles.flatList}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: Colors[colorScheme].text }]}>
                {error ??
                  'No city news. Live alerts load from Notify NYC when online; you can also seed cityNews in Firestore.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openCityNewsDetail(item)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#1e293b' : '#f8fafc',
                    borderColor: colorScheme === 'dark' ? '#334155' : '#e2e8f0',
                  },
                ]}>
                <View style={styles.newsCardRow}>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.newsThumb}
                      resizeMode="cover"
                    />
                  ) : null}
                  <View style={styles.newsCardText}>
                    <Text style={[styles.badge, { color: tint }]}>{item.source ?? 'News'}</Text>
                    <Text style={[styles.title, { color: Colors[colorScheme].text }]}>
                      {item.headline}
                    </Text>
                    {item.placeLabel ? (
                      <Text style={[styles.newsPlace, { color: tint }]} numberOfLines={1}>
                        {item.placeLabel}
                      </Text>
                    ) : null}
                    <Text style={[styles.sub, { color: Colors[colorScheme].text }]} numberOfLines={5}>
                      {item.summary}
                    </Text>
                    <Text style={[styles.learnMore, { color: tint }]} numberOfLines={1}>
                      {item.link ? 'Learn more →' : 'Read summary'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
            contentContainerStyle={listContentStyle}
          />,
        )
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  feedInner: { width: '100%' },
  listShell: { flex: 1, minHeight: 0 },
  flatList: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  header: { fontSize: 26, fontWeight: '800' },
  menuBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    paddingTop: 120,
    paddingHorizontal: 24,
  },
  menuBackdropWeb: {
    alignItems: 'center',
  },
  menuCard: { borderRadius: 14, paddingVertical: 8, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  menuCardWeb: {
    maxWidth: 400,
    width: '100%',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  list: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  badge: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '600' },
  sub: { marginTop: 6, fontSize: 14, opacity: 0.88 },
  dist: { marginTop: 8, fontSize: 13, fontWeight: '600', opacity: 0.8 },
  learnMore: { marginTop: 10, fontSize: 15, fontWeight: '700' },
  newsCardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  newsThumb: {
    width: 92,
    height: 92,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    marginRight: 12,
  },
  newsCardText: { flex: 1, minWidth: 0 },
  newsPlace: { marginTop: 4, fontSize: 13, fontWeight: '700' },
  newsPlaceModal: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  empty: { textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  readBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  readBackdropWeb: {
    alignItems: 'center',
  },
  readCard: { borderRadius: 16, padding: 0, maxHeight: '88%' as unknown as number },
  readCardWeb: {
    maxWidth: 480,
    width: '100%',
  },
  readScroll: { padding: 18 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  readModalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
    marginTop: -4,
  },
  readCloseIconWrap: { padding: 2 },
  readTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  readBody: { fontSize: 15, lineHeight: 22 },
  readImage: { width: '100%', height: 200, borderRadius: 12, marginTop: 12 },
  readClose: { marginTop: 16, alignItems: 'center' },
  readMeta: { fontSize: 13, fontWeight: '600', opacity: 0.9 },
  readActionBtn: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  forYouLoadingGif: { width: 120, height: 120, resizeMode: 'contain' },
});
