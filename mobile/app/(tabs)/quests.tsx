import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Text as PaperText } from 'react-native-paper';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/contexts/AuthContext';
import { CITY_PULSE_PRIMARY } from '@/constants/cityPulseNav';
import { webScreenInner, webScreenOuter } from '@/constants/webLayout';
import { useFloatingTabBarPadding } from '@/hooks/useFloatingTabBarPadding';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  approveQuestParticipant,
  subscribeMyQuestsTab,
  type QuestDoc,
} from '@/lib/questService';

const QUEST_BG_DARK = '#030712';
const ACCENT_LINE = CITY_PULSE_PRIMARY;

const STAT_CARDS: {
  num: string;
  label: string;
  color: string;
  bg: string;
  bgLight: string;
}[] = [
  {
    num: '7',
    label: 'Day streak',
    color: '#F97316',
    bg: 'rgba(249,115,22,0.14)',
    bgLight: 'rgba(249,115,22,0.1)',
  },
  {
    num: '680',
    label: 'Total XP',
    color: CITY_PULSE_PRIMARY,
    bg: 'rgba(16,185,129,0.14)',
    bgLight: 'rgba(16,185,129,0.1)',
  },
  {
    num: '3',
    label: 'Complete',
    color: '#22C55E',
    bg: 'rgba(34,197,94,0.14)',
    bgLight: 'rgba(34,197,94,0.1)',
  },
];

function describeQuestForUser(
  q: QuestDoc,
  userId: string,
): { badge: string; sub: string; tone: 'default' | 'pending' | 'active' } {
  const isAuthor = q.authorId === userId;
  const pendingMe = q.pendingParticipantIds.includes(userId);
  const joined =
    q.participantIds.includes(userId) || q.acceptedByUserId === userId;

  if (isAuthor) {
    const pend = q.pendingParticipantIds.length;
    if (q.status === 'completed') {
      return { badge: 'Completed', sub: 'This quest is finished', tone: 'default' };
    }
    if (q.status === 'failed') {
      return { badge: 'Closed', sub: 'Marked incomplete', tone: 'default' };
    }
    return {
      badge: 'You posted',
      sub:
        pend > 0
          ? `${pend} helper${pend === 1 ? '' : 's'} waiting for approval · ${q.participantIds.length}/${q.participantsRequired} confirmed`
          : `${q.participantIds.length}/${q.participantsRequired} confirmed`,
      tone: pend > 0 ? 'pending' : 'default',
    };
  }
  if (pendingMe) {
    return {
      badge: 'Awaiting host',
      sub: 'Your request to join is pending approval',
      tone: 'pending',
    };
  }
  if (joined) {
    if (q.status === 'in_progress') {
      return { badge: 'In progress', sub: 'Active neighborhood quest', tone: 'active' };
    }
    if (q.status === 'open') {
      return { badge: 'Upcoming', sub: 'Waiting for more players or host to start', tone: 'active' };
    }
    if (q.status === 'completed') {
      return { badge: 'Completed', sub: 'You took part in this quest', tone: 'default' };
    }
    return { badge: q.status, sub: q.title, tone: 'default' };
  }
  return { badge: 'Quest', sub: q.title, tone: 'default' };
}

export default function QuestsScreen() {
  const colorScheme = useColorScheme();
  const isLight = colorScheme === 'light';
  const tabPad = useFloatingTabBarPadding();
  const { user } = useAuth();
  const [myQuests, setMyQuests] = useState<QuestDoc[]>([]);
  const [questsLoading, setQuestsLoading] = useState(true);
  const [approveBusy, setApproveBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setMyQuests([]);
      setQuestsLoading(false);
      return;
    }
    setQuestsLoading(true);
    const unsub = subscribeMyQuestsTab(user.uid, (list) => {
      setMyQuests(list);
      setQuestsLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const onApprove = useCallback(
    async (questId: string, participantUserId: string) => {
      if (!user?.uid) return;
      const key = `${questId}:${participantUserId}`;
      setApproveBusy(key);
      try {
        await approveQuestParticipant(user.uid, questId, participantUserId);
      } finally {
        setApproveBusy(null);
      }
    },
    [user?.uid],
  );

  const listPad = useMemo(
    () => [styles.list, { paddingBottom: tabPad + 24 }],
    [tabPad],
  );

  const pageBg = isLight ? '#ffffff' : QUEST_BG_DARK;
  const heroTitleC = isLight ? '#000000' : '#f8fafc';
  const heroSubC = isLight ? '#404040' : 'rgba(248,250,252,0.62)';
  const statLabelC = isLight ? '#525252' : 'rgba(248,250,252,0.55)';
  const dailyTitleC = isLight ? '#000000' : '#f8fafc';
  const dailyDescC = isLight ? '#404040' : 'rgba(248,250,252,0.72)';
  const footerTxt = isLight ? '#262626' : 'rgba(226,232,240,0.85)';
  const cardTitleC = isLight ? '#0a0a0a' : '#f8fafc';
  const cardSubC = isLight ? '#525252' : 'rgba(226,232,240,0.85)';
  const badgeBg =
    (tone: 'default' | 'pending' | 'active') =>
      tone === 'pending'
        ? 'rgba(234,179,8,0.2)'
        : tone === 'active'
          ? `${CITY_PULSE_PRIMARY}22`
          : isLight
            ? 'rgba(0,0,0,0.06)'
            : 'rgba(148,163,184,0.15)';
  const badgeColor =
    (tone: 'default' | 'pending' | 'active') =>
      tone === 'pending' ? '#eab308' : tone === 'active' ? CITY_PULSE_PRIMARY : isLight ? '#404040' : '#94a3b8';

  if (!isFirebaseConfigured()) {
    return (
      <View style={[styles.center, { backgroundColor: pageBg }]}>
        <Text style={{ color: isLight ? '#000' : '#e2e8f0', textAlign: 'center' }}>
          Add EXPO_PUBLIC_FIREBASE_* variables to mobile/.env
        </Text>
      </View>
    );
  }

  const hero = (
    <View style={styles.hero}>
      <View style={styles.heroAccent} />
      <PaperText variant="headlineSmall" style={[styles.heroTitle, { color: heroTitleC }]}>
        City Quests
      </PaperText>
      <PaperText style={[styles.heroSub, { color: heroSubC }]} variant="bodyMedium">
        Complete challenges and earn city cred — your map quests appear below.
      </PaperText>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statRow}>
        {STAT_CARDS.map((s) => (
          <BlurView
            key={s.label}
            intensity={Platform.OS === 'web' ? (isLight ? 14 : 22) : isLight ? 25 : 40}
            tint={isLight ? 'light' : 'dark'}
            style={[
              styles.statCard,
              {
                borderColor: s.color,
                backgroundColor: isLight ? s.bgLight : s.bg,
              },
            ]}>
            <View style={[styles.statStripe, { backgroundColor: s.color }]} />
            <PaperText style={[styles.statNum, { color: s.color }]}>{s.num}</PaperText>
            <PaperText style={[styles.statLabel, { color: statLabelC }]}>{s.label}</PaperText>
          </BlurView>
        ))}
      </ScrollView>

      <BlurView
        intensity={Platform.OS === 'web' ? (isLight ? 14 : 22) : isLight ? 25 : 40}
        tint={isLight ? 'light' : 'dark'}
        style={[styles.dailyCard, isLight && styles.dailyCardLight]}>
        <View style={[styles.dailyGlow, { borderColor: ACCENT_LINE }]} />
        <View style={styles.dailyRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <PaperText style={[styles.dailyTitle, { color: dailyTitleC }]}>Daily challenge</PaperText>
            <PaperText style={[styles.dailyDesc, { color: dailyDescC }]} numberOfLines={2}>
              Spot and report a transit delay during rush hour for bonus XP.
            </PaperText>
          </View>
          <View style={[styles.xpBadge, { backgroundColor: `${CITY_PULSE_PRIMARY}28` }]}>
            <PaperText style={[styles.xpText, { color: CITY_PULSE_PRIMARY }]}>+300 XP</PaperText>
          </View>
        </View>
      </BlurView>

      <Text style={[styles.sectionLabel, { color: isLight ? '#171717' : '#e2e8f0' }]}>Your quests</Text>
      {!user?.uid ? (
        <Text style={[styles.emptyQuests, { color: cardSubC }]}>Sign in to see quests you post or join.</Text>
      ) : questsLoading ? (
        <ActivityIndicator color={CITY_PULSE_PRIMARY} style={{ marginVertical: 20 }} />
      ) : myQuests.length === 0 ? (
        <Text style={[styles.emptyQuests, { color: cardSubC }]}>
          Nothing yet — open the map, tap the quest pin, and post or join a neighborhood quest.
        </Text>
      ) : null}
    </View>
  );

  const renderQuest = ({ item: q }: { item: QuestDoc }) => {
    if (!user?.uid) return null;
    const { badge, sub, tone } = describeQuestForUser(q, user.uid);
    const isAuthor = q.authorId === user.uid;
    return (
      <View
        style={[
          styles.questCard,
          {
            borderColor: isLight ? '#e5e5e5' : '#334155',
            backgroundColor: isLight ? '#fafafa' : 'rgba(30,41,59,0.5)',
          },
        ]}>
        <View style={styles.questCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.questTitle, { color: cardTitleC }]} numberOfLines={2}>
              {q.title}
            </Text>
            <Text style={[styles.questAuthor, { color: cardSubC }]}>@{q.authorUsername}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: badgeBg(tone) }]}>
            <Text style={[styles.badgeTxt, { color: badgeColor(tone) }]}>{badge}</Text>
          </View>
        </View>
        <Text style={[styles.questSub, { color: cardSubC }]}>{sub}</Text>
        {isAuthor && q.pendingParticipantIds.length > 0 ? (
          <View style={styles.pendingBlock}>
            <Text style={[styles.pendingHeading, { color: cardSubC }]}>Approve helpers</Text>
            {q.pendingParticipantIds.map((pid, i) => {
              const name = q.pendingParticipantUsernames[i]?.trim() || 'Participant';
              const busy = approveBusy === `${q.id}:${pid}`;
              return (
                <View key={pid} style={styles.pendingRow}>
                  <Text style={[styles.pendingName, { color: cardTitleC }]} numberOfLines={1}>
                    @{name}
                  </Text>
                  <Pressable
                    style={[styles.approveBtn, { borderColor: CITY_PULSE_PRIMARY, opacity: busy ? 0.6 : 1 }]}
                    disabled={busy}
                    onPress={() => void onApprove(q.id, pid)}>
                    {busy ? (
                      <ActivityIndicator color={CITY_PULSE_PRIMARY} size="small" />
                    ) : (
                      <Text style={[styles.approveBtnTxt, { color: CITY_PULSE_PRIMARY }]}>Approve</Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.fill, webScreenOuter, { backgroundColor: pageBg }]}>
      <View style={[webScreenInner, styles.questColumn]}>
        <FlatList
          data={user?.uid ? myQuests : []}
          keyExtractor={(q) => q.id}
          renderItem={renderQuest}
          ListHeaderComponent={hero}
          contentContainerStyle={listPad}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <View style={[styles.footerHint, isLight && styles.footerHintLight]}>
              <Text style={[styles.footerHintTxt, { color: footerTxt }]}>
                Tip: open the map and use the{' '}
                <Text style={{ color: CITY_PULSE_PRIMARY, fontWeight: '800' }}>quest</Text> pin to create neighborhood
                challenges.
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  questColumn: { width: '100%' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  hero: { paddingTop: 12 },
  sectionLabel: { fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  emptyQuests: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  questCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  questCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  questTitle: { fontSize: 16, fontWeight: '800' },
  questAuthor: { fontSize: 12, marginTop: 4, opacity: 0.85 },
  questSub: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  pendingBlock: { marginTop: 12, gap: 8 },
  pendingHeading: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pendingName: { flex: 1, fontSize: 14, fontWeight: '600' },
  approveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    minWidth: 96,
    alignItems: 'center',
  },
  approveBtnTxt: { fontSize: 13, fontWeight: '800' },
  heroAccent: {
    width: 48,
    height: 4,
    borderRadius: 4,
    backgroundColor: ACCENT_LINE,
    marginBottom: 12,
    opacity: 0.95,
  },
  heroTitle: { fontWeight: '800', fontSize: 26 },
  heroSub: { marginTop: 8, lineHeight: 20 },
  statRow: { paddingVertical: 16 },
  statCard: {
    width: 118,
    borderRadius: 16,
    padding: 14,
    marginRight: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  statStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, marginVertical: 8, fontWeight: '600' },
  dailyCard: {
    borderRadius: 18,
    padding: 16,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: `${CITY_PULSE_PRIMARY}66`,
    backgroundColor: 'rgba(16,185,129,0.08)',
    overflow: 'hidden',
  },
  dailyCardLight: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderColor: `${CITY_PULSE_PRIMARY}44`,
  },
  dailyGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
    opacity: 0.35,
  },
  dailyRow: { flexDirection: 'row', alignItems: 'center' },
  dailyTitle: { fontWeight: '800', fontSize: 17 },
  dailyDesc: { fontSize: 13, lineHeight: 18 },
  xpBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  xpText: { fontWeight: '800', fontSize: 12 },
  footerHint: { marginTop: 20, padding: 12, borderRadius: 12, backgroundColor: 'rgba(148,163,184,0.08)' },
  footerHintLight: { backgroundColor: 'rgba(0,0,0,0.04)' },
  footerHintTxt: { fontSize: 13, lineHeight: 18 },
  list: { paddingHorizontal: 16, flexGrow: 1 },
});
