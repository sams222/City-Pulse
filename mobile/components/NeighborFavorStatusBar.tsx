import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  markQuestCompleteByAuthor,
  markQuestFailedByAuthor,
  subscribeNeighborFavorInProgressQuest,
  type QuestDoc,
} from '@/lib/questService';

const BAR_YELLOW = '#FACC15';
const BAR_BLACK = '#0a0a0a';

export function NeighborFavorStatusBar() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [quest, setQuest] = useState<QuestDoc | null>(null);
  const [busyAction, setBusyAction] = useState<null | 'complete' | 'fail'>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured()) {
      setQuest(null);
      return;
    }
    return subscribeNeighborFavorInProgressQuest(user.uid, setQuest);
  }, [user?.uid]);

  if (!user?.uid || !quest) {
    return null;
  }

  const isAuthor = quest.authorId === user.uid;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Text style={styles.title} numberOfLines={1}>
          NeighborFavor in progress
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {quest.title}
          {quest.description?.trim() ? ` — ${quest.description.trim()}` : ''}
        </Text>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {isAuthor ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnOk]}
              disabled={busyAction != null}
              onPress={() => {
                setError(null);
                setBusyAction('complete');
                void (async () => {
                  try {
                    await markQuestCompleteByAuthor(quest.id, user.uid);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not update quest.');
                  } finally {
                    setBusyAction(null);
                  }
                })();
              }}>
              {busyAction === 'complete' ? (
                <ActivityIndicator color={BAR_BLACK} size="small" />
              ) : (
                <Text style={styles.btnTextOk}>Quest Complete</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnFail]}
              disabled={busyAction != null}
              onPress={() => {
                setError(null);
                setBusyAction('fail');
                void (async () => {
                  try {
                    await markQuestFailedByAuthor(quest.id, user.uid);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Could not update quest.');
                  } finally {
                    setBusyAction(null);
                  }
                })();
              }}>
              {busyAction === 'fail' ? (
                <ActivityIndicator color={BAR_YELLOW} size="small" />
              ) : (
                <Text style={styles.btnTextFail}>Quest Failed</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: BAR_BLACK,
    borderBottomWidth: 3,
    borderBottomColor: BAR_BLACK,
  },
  bar: {
    backgroundColor: BAR_YELLOW,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
    borderBottomWidth: 3,
    borderBottomColor: BAR_BLACK,
  },
  title: {
    color: BAR_BLACK,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  sub: {
    color: BAR_BLACK,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    opacity: 0.92,
  },
  err: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  btn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BAR_BLACK,
    minHeight: 40,
  },
  btnFail: {
    backgroundColor: BAR_BLACK,
  },
  btnOk: {
    backgroundColor: BAR_YELLOW,
  },
  btnTextFail: {
    color: BAR_YELLOW,
    fontWeight: '800',
    fontSize: 13,
  },
  btnTextOk: {
    color: BAR_BLACK,
    fontWeight: '800',
    fontSize: 13,
  },
});
