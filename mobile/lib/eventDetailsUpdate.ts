import { doc, Timestamp, updateDoc } from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

export type EventSupplementaryPatch = {
  organizerName: string;
  organizerEmail: string;
  organizerPhone: string;
  /** When set and finite, also updates `startTime` on the event doc. */
  startTimeMs?: number;
};

/**
 * Updates only organizer / schedule fields (see Firestore rules).
 * Any signed-in user may submit missing info for scraped or legacy events.
 */
export async function patchEventSupplementaryInfo(eventId: string, patch: EventSupplementaryPatch): Promise<void> {
  const ref = doc(getDb(), 'events', eventId);
  const name = patch.organizerName.trim();
  const email = patch.organizerEmail.trim();
  const phone = patch.organizerPhone.trim();
  if (name.length > 200) throw new Error('Organizer name is too long');
  if (email.length > 320) throw new Error('Email is too long');
  if (phone.length > 40) throw new Error('Phone is too long');

  const data: Record<string, string | Timestamp> = {
    organizerName: name,
    organizerEmail: email,
    organizerPhone: phone,
  };

  if (patch.startTimeMs !== undefined) {
    if (!Number.isFinite(patch.startTimeMs) || patch.startTimeMs <= 0) {
      throw new Error('Invalid date and time');
    }
    data.startTime = Timestamp.fromMillis(Math.floor(patch.startTimeMs));
  }

  await updateDoc(ref, data);
}
