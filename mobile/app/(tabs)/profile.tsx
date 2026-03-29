import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { signOut } from 'firebase/auth';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

import { Brand } from '@/constants/Brand';
import { webScreenInner, webScreenOuter } from '@/constants/webLayout';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/contexts/AuthContext';
import { useFloatingTabBarPadding } from '@/hooks/useFloatingTabBarPadding';
import { fetchUserBookmarkedEvents, type BookmarkedEventSummary } from '@/lib/eventEngagement';
import { getFirebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import { googleMapsKeyPreview, googleMapsRoutesKeyPreview } from '@/lib/mapsEnv';
import {
  fetchNotificationsForUser,
  markNotificationRead,
  type UserNotificationRow,
} from '@/lib/questNotifications';
import { fetchQuestHistory, type QuestHistoryItem } from '@/lib/questService';
import { RoutingLogViewer } from '@/components/RoutingLogViewer';

function initialFromUser(display: string | undefined, email: string | undefined): string {
  const s = (display?.trim() || email?.trim() || '?').charAt(0);
  return s.toUpperCase();
}

function BookmarkRow({
  color,
  title,
  subtitle,
  last,
  titleColor,
  subtitleColor,
}: {
  color: string;
  title: string;
  subtitle: string;
  last?: boolean;
  titleColor: string;
  subtitleColor: string;
}) {
  return (
    <View style={[styles.activityRow, last && styles.activityRowLast]}>
      <View style={[styles.activityIcon, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
        <Text style={{ color, fontSize: 14 }}>★</Text>
      </View>
      <View style={styles.activityText}>
        <Text style={[styles.activityTitle, { color: titleColor }]}>{title}</Text>
        <Text style={[styles.activitySubtitle, { color: subtitleColor }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function NotificationRow({
  item,
  onPress,
  last,
  titleColor,
  subtitleColor,
}: {
  item: UserNotificationRow;
  onPress: () => void;
  last?: boolean;
  titleColor: string;
  subtitleColor: string;
}) {
  const color = Brand.metroTeal;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.activityRow, last && styles.activityRowLast, item.read && styles.notificationRead]}>
      <View style={[styles.activityIcon, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
        <Ionicons name="notifications-outline" size={18} color={color} />
      </View>
      <View style={styles.activityText}>
        <Text style={[styles.activityTitle, { color: titleColor }]}>{item.title}</Text>
        <Text style={[styles.activitySubtitle, { color: subtitleColor }]}>{item.body}</Text>
      </View>
    </Pressable>
  );
}

function QuestHistoryRow({
  item,
  last,
  titleColor,
  subtitleColor,
}: {
  item: QuestHistoryItem;
  last?: boolean;
  titleColor: string;
  subtitleColor: string;
}) {
  const roleLabel = item.role === 'author' ? 'You posted this NeighborFavor' : 'You joined this NeighborFavor';
  const outcomeLabel = item.outcome === 'failed' ? 'Quest failed' : 'Quest succeeded';
  const outcomeColor = item.outcome === 'failed' ? Brand.danger : Brand.safe;
  const desc =
    item.questDescription.trim().length > 0
      ? item.questDescription.trim()
      : 'No extra details.';

  return (
    <View style={[styles.activityRow, last && styles.activityRowLast]}>
      <View
        style={[
          styles.activityIcon,
          { backgroundColor: `${outcomeColor}22`, borderColor: `${outcomeColor}55` },
        ]}>
        <Text style={{ color: outcomeColor, fontSize: 14 }}>{item.outcome === 'failed' ? '✕' : '✓'}</Text>
      </View>
      <View style={styles.activityText}>
        <Text style={[styles.activityTitle, { color: titleColor }]}>{item.questTitle}</Text>
        <Text style={[styles.activitySubtitle, { color: subtitleColor }]}>{desc}</Text>
        <Text style={[styles.questMeta, { color: outcomeColor }]}>{outcomeLabel}</Text>
        <Text style={[styles.questRole, { color: subtitleColor }]}>{roleLabel}</Text>
        <Text style={[styles.questWhen, { color: subtitleColor }]}>
          {item.completedAt ? new Date(item.completedAt).toLocaleString() : ''}
        </Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isLight = colorScheme === 'light';
  const { user, profile } = useAuth();
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '—';

  const [bookmarks, setBookmarks] = useState<BookmarkedEventSummary[]>([]);
  const [notifications, setNotifications] = useState<UserNotificationRow[]>([]);
  const [questHistory, setQuestHistory] = useState<QuestHistoryItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const loadActivity = useCallback(async () => {
    if (!user?.uid || !isFirebaseConfigured()) {
      setBookmarks([]);
      setNotifications([]);
      setQuestHistory([]);
      return;
    }
    setActivityLoading(true);
    try {
      const [bm, n, qh] = await Promise.all([
        fetchUserBookmarkedEvents(user.uid),
        fetchNotificationsForUser(user.uid, 24),
        fetchQuestHistory(user.uid, 50),
      ]);
      setBookmarks(bm.slice(0, 20));
      setNotifications(n);
      setQuestHistory(qh);
    } catch {
      /* keep previous lists */
    } finally {
      setActivityLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      void loadActivity();
    }, [loadActivity]),
  );

  const onNotificationPress = (row: UserNotificationRow) => {
    if (row.read) return;
    void (async () => {
      try {
        await markNotificationRead(row.id);
        setNotifications((prev) => prev.map((x) => (x.id === row.id ? { ...x, read: true } : x)));
      } catch {
        /* ignore */
      }
    })();
  };

  const displayName =
    profile?.username != null && profile.username.length > 0
      ? profile.username
      : user?.email?.split('@')[0] ?? 'Guest';
  const avatarLetter = initialFromUser(profile?.username, user?.email ?? undefined);

  const tabBarPad = useFloatingTabBarPadding();
  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingBottom: tabBarPad }],
    [tabBarPad],
  );

  const t = isLight
    ? {
        bg: '#ffffff',
        card: '#f5f5f5',
        text: '#000000',
        textMuted: '#525252',
        border: '#e5e5e5',
        settings: '#404040',
      }
    : {
        bg: Brand.background,
        card: Brand.surface,
        text: Brand.textPrimary,
        textMuted: Brand.textSecondary,
        border: Brand.borderSubtle,
        settings: Brand.textSecondary,
      };

  return (
    <View style={[styles.container, webScreenOuter, { backgroundColor: t.bg }]}>
      <View style={[webScreenInner, styles.profileInner]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={scrollContentStyle}>
        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border, borderWidth: isLight ? 1 : 0 }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.pageTitle, { color: t.text }]}>Profile</Text>
            <Pressable onPress={() => router.push('/(auth)/preferences')} hitSlop={8}>
              <Text style={[styles.settingsLink, { color: t.settings }]}>Settings</Text>
            </Pressable>
          </View>

          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
            <Text style={styles.userName}>{displayName}</Text>
          </View>

          <View style={styles.authButtons}>
            <Pressable
              style={styles.signInButton}
              onPress={() =>
                user ? router.push('/(auth)/preferences') : router.push('/(auth)/login')
              }>
              <Text style={[styles.signInText, isLight && { color: Brand.electricViolet }]}>
                {user ? 'Interests' : 'Sign in'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.logOutButton, !user && styles.logOutButtonDisabled, isLight && styles.logOutButtonLight]}
              disabled={!user}
              onPress={() => (user ? void signOut(getFirebaseAuth()) : undefined)}>
              <Text style={[styles.logOutText, !user && styles.logOutTextDisabled]}>Log out</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border, borderWidth: isLight ? 1 : 0 }]}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Bookmarks</Text>
          {!user?.uid ? (
            <Text style={[styles.activityHint, { color: t.textMuted }]}>Sign in to see bookmarked events.</Text>
          ) : activityLoading && bookmarks.length === 0 ? (
            <ActivityIndicator color={isLight ? Brand.electricViolet : Brand.icyLavender} style={{ marginVertical: 8 }} />
          ) : bookmarks.length === 0 ? (
            <Text style={[styles.activityHint, { color: t.textMuted }]}>No bookmarks yet. Save events from the Feed.</Text>
          ) : (
            bookmarks.map((b, i) => (
              <BookmarkRow
                key={b.eventId}
                color={Brand.communityPulse}
                title={b.title}
                subtitle={b.startTimeMs ? new Date(b.startTimeMs).toLocaleString() : 'Date TBA'}
                last={i === bookmarks.length - 1}
                titleColor={t.text}
                subtitleColor={t.textMuted}
              />
            ))
          )}

          <Text style={[styles.sectionTitle, styles.subsectionTitleSpacing, { color: t.text }]}>Quest history</Text>
          {!user?.uid ? (
            <Text style={[styles.activityHint, { color: t.textMuted }]}>Sign in to see NeighborFavor history.</Text>
          ) : activityLoading && questHistory.length === 0 ? (
            <ActivityIndicator color={isLight ? Brand.electricViolet : Brand.icyLavender} style={{ marginVertical: 8 }} />
          ) : questHistory.length === 0 ? (
            <Text style={[styles.activityHint, { color: t.textMuted }]}>
              No completed NeighborFavors yet. When you post or join one and the poster marks it complete or failed,
              it appears here.
            </Text>
          ) : (
            questHistory.map((h, i) => (
              <QuestHistoryRow
                key={h.id}
                item={h}
                last={i === questHistory.length - 1}
                titleColor={t.text}
                subtitleColor={t.textMuted}
              />
            ))
          )}

          <Text style={[styles.sectionTitle, styles.subsectionTitleSpacing]}>Quest updates</Text>
          {!user?.uid ? (
            <Text style={styles.activityHint}>Sign in to see when someone joins your quests.</Text>
          ) : activityLoading && notifications.length === 0 ? (
            <ActivityIndicator color={Brand.icyLavender} style={{ marginVertical: 8 }} />
          ) : notifications.length === 0 ? (
            <Text style={styles.activityHint}>No notifications yet.</Text>
          ) : (
            notifications.map((n, i) => (
              <NotificationRow
                key={n.id}
                item={n}
                onPress={() => onNotificationPress(n)}
                last={i === notifications.length - 1}
                titleColor={t.text}
                subtitleColor={t.textMuted}
              />
            ))
          )}
        </View>

        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border, borderWidth: isLight ? 1 : 0 }]}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>App</Text>
          <View style={styles.appInner}>
            <Row label="Firebase project" value={projectId} labelColor={t.textMuted} valueColor={t.text} borderColor={t.border} />
            <Row label="Google Maps key (tiles / JS)" value={googleMapsKeyPreview()} labelColor={t.textMuted} valueColor={t.text} borderColor={t.border} />
            <Row
              label="Directions key (routes)"
              value={googleMapsRoutesKeyPreview()}
              labelColor={t.textMuted}
              valueColor={t.text}
              borderColor={t.border}
            />
            <Row
              label="App version"
              value={Constants.expoConfig?.version ?? '—'}
              last
              labelColor={t.textMuted}
              valueColor={t.text}
              borderColor={t.border}
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border, borderWidth: isLight ? 1 : 0 }]}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Routing log</Text>
          <RoutingLogViewer
            textColor={t.text}
            mutedColor={t.textMuted}
            panelBg={isLight ? '#f4f4f5' : '#141418'}
            borderColor={t.border}
          />
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  last,
  labelColor,
  valueColor,
  borderColor,
}: {
  label: string;
  value: string;
  last?: boolean;
  labelColor: string;
  valueColor: string;
  borderColor: string;
}) {
  return (
    <View style={[styles.appRow, last && styles.appRowLast, { borderBottomColor: borderColor }]}>
      <Text style={[styles.appLabel, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.appValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
  },
  profileInner: {
    width: '100%',
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: Brand.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingsLink: {
    fontSize: 12,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Brand.electricViolet,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Brand.icyLavender,
  },
  avatarText: {
    color: '#EDE8FF',
    fontSize: 26,
    fontWeight: '500',
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
  },
  authButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  signInButton: {
    flex: 1,
    backgroundColor: `${Brand.electricViolet}22`,
    borderWidth: 1,
    borderColor: `${Brand.electricViolet}55`,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  signInButtonLight: {
    backgroundColor: 'rgba(108,71,255,0.08)',
    borderColor: 'rgba(108,71,255,0.35)',
  },
  signInText: {
    color: Brand.icyLavender,
    fontSize: 13,
    fontWeight: '500',
  },
  logOutButton: {
    flex: 1,
    backgroundColor: `${Brand.danger}11`,
    borderWidth: 1,
    borderColor: `${Brand.danger}33`,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  logOutButtonLight: {
    backgroundColor: 'rgba(255,59,48,0.06)',
    borderColor: 'rgba(255,59,48,0.25)',
  },
  logOutButtonDisabled: {
    opacity: 0.35,
  },
  logOutText: {
    color: Brand.danger,
    fontSize: 13,
    fontWeight: '500',
  },
  logOutTextDisabled: {
    color: Brand.textSecondary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
  },
  subsectionTitleSpacing: {
    marginTop: 20,
  },
  activityHint: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  notificationRead: {
    opacity: 0.55,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  activityRowLast: {
    marginBottom: 0,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 12,
  },
  activitySubtitle: {
    fontSize: 10,
  },
  questMeta: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  questRole: {
    fontSize: 10,
    marginTop: 2,
  },
  questWhen: {
    fontSize: 9,
    marginTop: 2,
  },
  appInner: {
    gap: 0,
  },
  appRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.borderSubtle,
  },
  appRowLast: {
    borderBottomWidth: 0,
  },
  appLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  appValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
});
