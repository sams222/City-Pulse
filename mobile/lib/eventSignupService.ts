import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

function signupDocId(eventId: string, userId: string): string {
  return `${eventId}_${userId}`;
}

export async function signUpForEvent(userId: string, eventId: string): Promise<void> {
  await setDoc(doc(getDb(), 'eventSignups', signupDocId(eventId, userId)), {
    eventId,
    userId,
    createdAt: serverTimestamp(),
  });
}

export async function cancelEventSignup(userId: string, eventId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'eventSignups', signupDocId(eventId, userId)));
}

export async function hasSignedUpForEvent(userId: string, eventId: string): Promise<boolean> {
  const snap = await getDoc(doc(getDb(), 'eventSignups', signupDocId(eventId, userId)));
  return snap.exists();
}
