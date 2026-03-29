import { addDoc, collection, Timestamp } from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

export type CreateMapEventInput = {
  hostUserId: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  organizerName?: string;
  organizerEmail?: string;
  organizerPhone?: string;
};

/**
 * Creates a minimal map event (name, optional description, coordinates).
 * Requires Firestore rules that allow authenticated `create` on `events` with `source == 'user'`.
 */
export async function createUserMapEvent(input: CreateMapEventInput): Promise<string> {
  const { hostUserId, title, description, lat, lng, organizerName, organizerEmail, organizerPhone } = input;
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error('Name is required');
  }
  if (trimmedTitle.length > 200) {
    throw new Error('Name is too long (max 200 characters)');
  }
  const desc = description.trim();
  if (desc.length > 4000) {
    throw new Error('Description is too long');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Invalid location');
  }
  const oname = (organizerName ?? '').trim();
  const email = (organizerEmail ?? '').trim();
  const phone = (organizerPhone ?? '').trim();
  if (oname.length > 200 || email.length > 320 || phone.length > 40) {
    throw new Error('Contact info is too long');
  }

  const docRef = await addDoc(collection(getDb(), 'events'), {
    title: trimmedTitle,
    ...(desc.length > 0 ? { description: desc } : {}),
    lat,
    lng,
    startTime: Timestamp.now(),
    source: 'user',
    hostUserId,
    ...(oname.length > 0 ? { organizerName: oname } : {}),
    ...(email.length > 0 ? { organizerEmail: email } : {}),
    ...(phone.length > 0 ? { organizerPhone: phone } : {}),
  });
  return docRef.id;
}
