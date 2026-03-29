import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

export type UserNotificationRow = {
  id: string;
  title: string;
  body: string;
  questId: string;
  read: boolean;
  createdAtMs: number;
};

export async function fetchNotificationsForUser(userId: string, max = 40): Promise<UserNotificationRow[]> {
  const qy = query(
    collection(getDb(), 'userNotifications'),
    where('targetUserId', '==', userId),
    limit(max * 2),
  );
  const snap = await getDocs(qy);
  const rows: UserNotificationRow[] = [];
  snap.forEach((d) => {
    const x = d.data();
    rows.push({
      id: d.id,
      title: typeof x.title === 'string' ? x.title : '',
      body: typeof x.body === 'string' ? x.body : '',
      questId: typeof x.questId === 'string' ? x.questId : '',
      read: x.read === true,
      createdAtMs:
        x.createdAt && typeof x.createdAt === 'object' && 'toMillis' in x.createdAt
          ? (x.createdAt as { toMillis: () => number }).toMillis()
          : 0,
    });
  });
  rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return rows.slice(0, max);
}

export async function notifyQuestAuthorOfAcceptance(input: {
  authorId: string;
  fromUserId: string;
  accepterDisplayName: string;
  questId: string;
  questTitle: string;
}): Promise<void> {
  await addDoc(collection(getDb(), 'userNotifications'), {
    targetUserId: input.authorId,
    fromUserId: input.fromUserId,
    questId: input.questId,
    title: 'Quest joined',
    body: `${input.accepterDisplayName} joined “${input.questTitle}”.`,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'userNotifications', notificationId), { read: true });
}
