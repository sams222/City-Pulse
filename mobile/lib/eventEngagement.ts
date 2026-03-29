import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

const INTERESTED_SUB = 'interested';

export async function getEventInterestCount(eventId: string): Promise<number> {
  const snap = await getCountFromServer(query(collection(getDb(), 'events', eventId, INTERESTED_SUB)));
  return snap.data().count;
}

export async function isUserInterestedInEvent(eventId: string, userId: string): Promise<boolean> {
  const d = await getDoc(doc(getDb(), 'events', eventId, INTERESTED_SUB, userId));
  return d.exists();
}

/** Toggle interest; returns new interested state. */
export async function setUserInterestedInEvent(
  eventId: string,
  userId: string,
  wantInterested: boolean,
): Promise<boolean> {
  const ref = doc(getDb(), 'events', eventId, INTERESTED_SUB, userId);
  if (!wantInterested) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { createdAt: serverTimestamp() });
  return true;
}

export async function isEventBookmarked(userId: string, eventId: string): Promise<boolean> {
  const d = await getDoc(doc(getDb(), 'users', userId, 'eventBookmarks', eventId));
  return d.exists();
}

export async function setEventBookmarked(
  userId: string,
  eventId: string,
  bookmarked: boolean,
): Promise<void> {
  const ref = doc(getDb(), 'users', userId, 'eventBookmarks', eventId);
  if (!bookmarked) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, { eventId, savedAt: serverTimestamp() });
}

export type BookmarkedEventSummary = {
  eventId: string;
  title: string;
  startTimeMs: number;
};

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

export async function fetchUserBookmarkedEvents(userId: string): Promise<BookmarkedEventSummary[]> {
  const snap = await getDocs(collection(getDb(), 'users', userId, 'eventBookmarks'));
  const out: BookmarkedEventSummary[] = [];
  for (const d of snap.docs) {
    const eventId = d.id;
    const ev = await getDoc(doc(getDb(), 'events', eventId));
    if (!ev.exists()) continue;
    const data = ev.data();
    const title = typeof data.title === 'string' ? data.title : 'Event';
    out.push({
      eventId,
      title,
      startTimeMs: toMillis(data.startTime ?? data.endTime),
    });
  }
  out.sort((a, b) => b.startTimeMs - a.startTimeMs);
  return out;
}
