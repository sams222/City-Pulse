import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

export type PersonalMarker = {
  id: string;
  userId: string;
  title: string;
  note: string;
  lat: number;
  lng: number;
  createdAt?: unknown;
};

export function subscribePersonalMarkers(
  userId: string,
  onData: (markers: PersonalMarker[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const qy = query(collection(getDb(), 'personalMarkers'), where('userId', '==', userId));
  return onSnapshot(
    qy,
    (snap) => {
      const list: PersonalMarker[] = [];
      snap.forEach((d) => {
        const x = d.data();
        const lat = typeof x.lat === 'number' ? x.lat : Number(x.lat);
        const lng = typeof x.lng === 'number' ? x.lng : Number(x.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        list.push({
          id: d.id,
          userId: String(x.userId ?? ''),
          title: typeof x.title === 'string' ? x.title : 'Reminder',
          note: typeof x.note === 'string' ? x.note : '',
          lat,
          lng,
          createdAt: x.createdAt,
        });
      });
      list.sort((a, b) => {
        const ta =
          a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt
            ? (a.createdAt as { toMillis: () => number }).toMillis()
            : 0;
        const tb =
          b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt
            ? (b.createdAt as { toMillis: () => number }).toMillis()
            : 0;
        return tb - ta;
      });
      onData(list);
    },
    (e) => onError?.(e),
  );
}

export async function addPersonalMarker(
  userId: string,
  input: { title: string; note: string; lat: number; lng: number },
): Promise<void> {
  await addDoc(collection(getDb(), 'personalMarkers'), {
    userId,
    title: input.title.trim() || 'Reminder',
    note: input.note.trim(),
    lat: input.lat,
    lng: input.lng,
    createdAt: serverTimestamp(),
  });
}

export async function deletePersonalMarker(markerId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'personalMarkers', markerId));
}
