import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import { notifyQuestAuthorOfAcceptance } from '@/lib/questNotifications';

export type QuestDoc = {
  id: string;
  authorId: string;
  authorUsername: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  status: 'open' | 'in_progress' | 'completed' | 'failed';
  participantsRequired: number;
  participantIds: string[];
  participantUsernames: string[];
  /** When true, joiners sit in pending until the author approves them. */
  requireHostApproval: boolean;
  pendingParticipantIds: string[];
  pendingParticipantUsernames: string[];
  acceptedByUserId?: string;
  acceptedByUsername?: string;
  completedByUserId?: string;
  completedByUsername?: string;
  progress: number;
  createdAt?: unknown;
  completedAt?: unknown;
};

export type QuestHistoryItem = {
  id: string;
  userId: string;
  questId: string;
  questTitle: string;
  /** Summary text from the quest posting. */
  questDescription: string;
  authorUsername: string;
  /** Poster vs helper who joined. */
  role: 'author' | 'participant';
  /** Set when the author closes the NeighborFavor. */
  outcome: 'succeeded' | 'failed';
  completedAt: number;
};

function questTimeMs(q: QuestDoc): number {
  const c = q.createdAt;
  if (c && typeof c === 'object' && 'toMillis' in c) {
    return (c as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string') as string[];
}

export function parseQuest(id: string, data: Record<string, unknown>): QuestDoc | null {
  const lat = typeof data.lat === 'number' ? data.lat : Number(data.lat);
  const lng = typeof data.lng === 'number' ? data.lng : Number(data.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const status =
    data.status === 'open' ||
    data.status === 'in_progress' ||
    data.status === 'completed' ||
    data.status === 'failed'
      ? data.status
      : 'open';
  let participantIds = asStringArray(data.participantIds);
  const legacyUid = typeof data.acceptedByUserId === 'string' ? data.acceptedByUserId : '';
  if (participantIds.length === 0 && legacyUid) {
    participantIds = [legacyUid];
  }
  let participantUsernames = asStringArray(data.participantUsernames);
  const legacyName = typeof data.acceptedByUsername === 'string' ? data.acceptedByUsername : '';
  if (participantUsernames.length === 0 && legacyName && participantIds.length === 1) {
    participantUsernames = [legacyName];
  }
  let participantsRequired =
    typeof data.participantsRequired === 'number' && Number.isFinite(data.participantsRequired)
      ? Math.min(100, Math.max(1, Math.floor(data.participantsRequired)))
      : 1;

  if (participantIds.length > participantsRequired) {
    participantsRequired = participantIds.length;
  }

  const requireHostApproval = data.requireHostApproval === true;
  let pendingParticipantIds = asStringArray(data.pendingParticipantIds);
  let pendingParticipantUsernames = asStringArray(data.pendingParticipantUsernames);
  if (pendingParticipantIds.length !== pendingParticipantUsernames.length) {
    while (pendingParticipantUsernames.length < pendingParticipantIds.length) {
      pendingParticipantUsernames.push('Participant');
    }
  }

  return {
    id,
    authorId: String(data.authorId ?? ''),
    authorUsername: typeof data.authorUsername === 'string' ? data.authorUsername : 'Someone',
    title: typeof data.title === 'string' ? data.title : 'Quest',
    description: typeof data.description === 'string' ? data.description : '',
    lat,
    lng,
    status,
    participantsRequired,
    participantIds,
    participantUsernames,
    requireHostApproval,
    pendingParticipantIds,
    pendingParticipantUsernames,
    acceptedByUserId: typeof data.acceptedByUserId === 'string' ? data.acceptedByUserId : undefined,
    acceptedByUsername: typeof data.acceptedByUsername === 'string' ? data.acceptedByUsername : undefined,
    completedByUserId: typeof data.completedByUserId === 'string' ? data.completedByUserId : undefined,
    completedByUsername: typeof data.completedByUsername === 'string' ? data.completedByUsername : undefined,
    progress: typeof data.progress === 'number' ? data.progress : 0,
    createdAt: data.createdAt,
    completedAt: data.completedAt,
  };
}

function questHasOpenSlot(q: QuestDoc): boolean {
  if (q.status !== 'open') return false;
  return q.participantIds.length < q.participantsRequired;
}

export function subscribeOpenQuests(
  userId: string,
  deniedQuestIds: Set<string>,
  onData: (quests: QuestDoc[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const qy = query(collection(getDb(), 'quests'), where('status', '==', 'open'));
  return onSnapshot(
    qy,
    (snap) => {
      const list: QuestDoc[] = [];
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (!q) return;
        if (deniedQuestIds.has(q.id)) return;
        if (!questHasOpenSlot(q)) return;
        list.push(q);
      });
      list.sort((a, b) => questTimeMs(b) - questTimeMs(a));
      onData(list);
    },
    (e) => onError?.(e),
  );
}

/**
 * All quests the user should see on the Quests tab: posted by them, joined, pending approval, or legacy accepter.
 */
export function subscribeMyQuestsTab(
  userId: string,
  onData: (quests: QuestDoc[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const db = getDb();
  const asAuthor = new Map<string, QuestDoc>();
  const asParticipant = new Map<string, QuestDoc>();
  const asLegacy = new Map<string, QuestDoc>();
  const asPending = new Map<string, QuestDoc>();

  const emit = () => {
    const merged = new Map<string, QuestDoc>();
    for (const q of asAuthor.values()) merged.set(q.id, q);
    for (const q of asParticipant.values()) merged.set(q.id, q);
    for (const q of asLegacy.values()) merged.set(q.id, q);
    for (const q of asPending.values()) merged.set(q.id, q);
    const list = Array.from(merged.values());
    list.sort((a, b) => questTimeMs(b) - questTimeMs(a));
    onData(list);
  };

  const u1 = onSnapshot(
    query(collection(db, 'quests'), where('authorId', '==', userId)),
    (snap) => {
      asAuthor.clear();
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q) asAuthor.set(q.id, q);
      });
      emit();
    },
    (e) => onError?.(e),
  );

  const u2 = onSnapshot(
    query(collection(db, 'quests'), where('participantIds', 'array-contains', userId)),
    (snap) => {
      asParticipant.clear();
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q) asParticipant.set(q.id, q);
      });
      emit();
    },
    (e) => onError?.(e),
  );

  const u3 = onSnapshot(
    query(collection(db, 'quests'), where('acceptedByUserId', '==', userId)),
    (snap) => {
      asLegacy.clear();
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q) asLegacy.set(q.id, q);
      });
      emit();
    },
    (e) => onError?.(e),
  );

  const u4 = onSnapshot(
    query(collection(db, 'quests'), where('pendingParticipantIds', 'array-contains', userId)),
    (snap) => {
      asPending.clear();
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q) asPending.set(q.id, q);
      });
      emit();
    },
    (e) => onError?.(e),
  );

  return () => {
    u1();
    u2();
    u3();
    u4();
  };
}

export function subscribeDeniedQuestIds(
  userId: string,
  onData: (ids: Set<string>) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const qy = query(collection(getDb(), 'questDenials'), where('userId', '==', userId));
  return onSnapshot(
    qy,
    (snap) => {
      const ids = new Set<string>();
      snap.forEach((d) => {
        const x = d.data();
        if (typeof x.questId === 'string') ids.add(x.questId);
      });
      onData(ids);
    },
    (e) => onError?.(e),
  );
}

function pickInProgress(q: QuestDoc | null): QuestDoc | null {
  if (!q || q.status !== 'in_progress') return null;
  return q;
}

function bestOfQuests(candidates: QuestDoc[]): QuestDoc | null {
  if (candidates.length === 0) return null;
  const uniq = [...new Map(candidates.map((q) => [q.id, q])).values()];
  uniq.sort((a, b) => questTimeMs(b) - questTimeMs(a));
  return uniq[0] ?? null;
}

/** Active quest: user is in participantIds (multi) or legacy acceptedByUserId. */
export function subscribeActiveQuestForUser(
  userId: string,
  onData: (quest: QuestDoc | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const db = getDb();
  let fromParticipants: QuestDoc | null = null;
  let fromLegacy: QuestDoc | null = null;

  const emit = () => {
    const a = pickInProgress(fromParticipants);
    const b = pickInProgress(fromLegacy);
    onData(a ?? b ?? null);
  };

  const u1 = onSnapshot(
    query(collection(db, 'quests'), where('participantIds', 'array-contains', userId)),
    (snap) => {
      fromParticipants = null;
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q && q.status === 'in_progress' && q.participantIds.includes(userId)) {
          fromParticipants = q;
        }
      });
      emit();
    },
    (e) => onError?.(e),
  );

  const u2 = onSnapshot(
    query(collection(db, 'quests'), where('acceptedByUserId', '==', userId)),
    (snap) => {
      fromLegacy = null;
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q && q.status === 'in_progress') {
          fromLegacy = q;
        }
      });
      emit();
    },
    (e) => onError?.(e),
  );

  return () => {
    u1();
    u2();
  };
}

/**
 * In-progress NeighborFavor for anyone involved: author or participant (multi or legacy single accepter).
 * If multiple are active, the most recently created is chosen.
 */
export function subscribeNeighborFavorInProgressQuest(
  userId: string,
  onData: (quest: QuestDoc | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const db = getDb();
  let asAuthor: QuestDoc[] = [];
  let asParticipant: QuestDoc[] = [];
  let asLegacy: QuestDoc[] = [];

  const emit = () => {
    const merged = [...asAuthor, ...asParticipant, ...asLegacy];
    onData(bestOfQuests(merged));
  };

  const u0 = onSnapshot(
    query(
      collection(db, 'quests'),
      where('authorId', '==', userId),
      where('status', '==', 'in_progress'),
    ),
    (snap) => {
      asAuthor = [];
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q && q.status === 'in_progress') asAuthor.push(q);
      });
      emit();
    },
    (e) => onError?.(e),
  );

  const u1 = onSnapshot(
    query(collection(db, 'quests'), where('participantIds', 'array-contains', userId)),
    (snap) => {
      asParticipant = [];
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q && q.status === 'in_progress' && q.participantIds.includes(userId)) {
          asParticipant.push(q);
        }
      });
      emit();
    },
    (e) => onError?.(e),
  );

  const u2 = onSnapshot(
    query(collection(db, 'quests'), where('acceptedByUserId', '==', userId)),
    (snap) => {
      asLegacy = [];
      snap.forEach((d) => {
        const q = parseQuest(d.id, d.data() as Record<string, unknown>);
        if (q && q.status === 'in_progress') asLegacy.push(q);
      });
      emit();
    },
    (e) => onError?.(e),
  );

  return () => {
    u0();
    u1();
    u2();
  };
}

export async function denyQuest(userId: string, questId: string): Promise<void> {
  await addDoc(collection(getDb(), 'questDenials'), {
    userId,
    questId,
    createdAt: serverTimestamp(),
  });
}

export async function acceptQuest(
  userId: string,
  accepterUsername: string,
  quest: QuestDoc,
): Promise<void> {
  const db = getDb();
  const ref = doc(db, 'quests', quest.id);
  const name = accepterUsername.trim() || 'Participant';

  const { authorId, title, notify } = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Quest not found');
    const d = snap.data() as Record<string, unknown>;
    if (String(d.authorId) === userId) throw new Error('You posted this quest');
    if (d.status !== 'open') throw new Error('Quest is no longer open');

    let ids = asStringArray(d.participantIds);
    const legacy = typeof d.acceptedByUserId === 'string' ? d.acceptedByUserId : '';
    if (ids.length === 0 && legacy) ids = [legacy];
    let names = asStringArray(d.participantUsernames);
    const legacyName = typeof d.acceptedByUsername === 'string' ? d.acceptedByUsername : '';
    if (names.length === 0 && legacyName && ids.length === 1) names = [legacyName];

    let pIds = asStringArray(d.pendingParticipantIds);
    let pNames = asStringArray(d.pendingParticipantUsernames);
    while (pNames.length < pIds.length) pNames.push('Participant');

    if (ids.includes(userId)) {
      return { authorId: String(d.authorId), title: String(d.title ?? 'Quest'), notify: false };
    }

    let required =
      typeof d.participantsRequired === 'number' && Number.isFinite(d.participantsRequired)
        ? Math.min(100, Math.max(1, Math.floor(d.participantsRequired)))
        : 1;

    if (ids.length >= required) throw new Error('Quest is full');

    const needApproval = d.requireHostApproval === true;
    if (needApproval) {
      if (pIds.includes(userId)) {
        return { authorId: String(d.authorId), title: String(d.title ?? 'Quest'), notify: false };
      }
      const nextPIds = [...pIds, userId];
      const nextPNames = [...pNames, name];
      transaction.update(ref, {
        pendingParticipantIds: nextPIds,
        pendingParticipantUsernames: nextPNames,
      });
      return {
        authorId: String(d.authorId ?? ''),
        title: typeof d.title === 'string' ? d.title : 'Quest',
        notify: true,
      };
    }

    const nextIds = [...ids, userId];
    const nextNames = [...names, name];
    if (nextNames.length < nextIds.length) {
      while (nextNames.length < nextIds.length) nextNames.push('Participant');
    }

    const filled = nextIds.length >= required;
    const nextStatus = filled ? 'in_progress' : 'open';

    const payload: Record<string, unknown> = {
      participantIds: nextIds,
      participantUsernames: nextNames,
      participantsRequired: required,
      status: nextStatus,
      progress: typeof d.progress === 'number' ? d.progress : 0,
    };

    if (legacy) {
      payload.acceptedByUserId = deleteField();
      payload.acceptedByUsername = deleteField();
    }

    transaction.update(ref, payload);
    return {
      authorId: String(d.authorId ?? ''),
      title: typeof d.title === 'string' ? d.title : 'Quest',
      notify: true,
    };
  });

  if (notify && authorId && authorId !== userId) {
    try {
      await notifyQuestAuthorOfAcceptance({
        authorId,
        fromUserId: userId,
        accepterDisplayName: name,
        questId: quest.id,
        questTitle: title,
      });
    } catch {
      /* non-fatal */
    }
  }
}

/** Host confirms a pending helper; moves them into participantIds and may start the quest. */
export async function approveQuestParticipant(
  authorId: string,
  questId: string,
  participantUserId: string,
): Promise<void> {
  const db = getDb();
  const ref = doc(db, 'quests', questId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Quest not found');
    const d = snap.data() as Record<string, unknown>;
    if (String(d.authorId) !== authorId) throw new Error('Only the host can approve helpers');
    if (d.status !== 'open') throw new Error('Quest is not accepting approvals');

    let ids = asStringArray(d.participantIds);
    const legacy = typeof d.acceptedByUserId === 'string' ? d.acceptedByUserId : '';
    if (ids.length === 0 && legacy) ids = [legacy];
    let names = asStringArray(d.participantUsernames);
    const legacyName = typeof d.acceptedByUsername === 'string' ? d.acceptedByUsername : '';
    if (names.length === 0 && legacyName && ids.length === 1) names = [legacyName];

    const pIds = asStringArray(d.pendingParticipantIds);
    const pNames = asStringArray(d.pendingParticipantUsernames);
    const idx = pIds.indexOf(participantUserId);
    if (idx < 0) throw new Error('That user is not waiting for approval');

    const participantName = (pNames[idx] ?? 'Participant').trim() || 'Participant';

    const nextPIds = pIds.filter((_, i) => i !== idx);
    const nextPNames = pNames.filter((_, i) => i !== idx);

    let required =
      typeof d.participantsRequired === 'number' && Number.isFinite(d.participantsRequired)
        ? Math.min(100, Math.max(1, Math.floor(d.participantsRequired)))
        : 1;

    if (ids.includes(participantUserId)) {
      transaction.update(ref, {
        pendingParticipantIds: nextPIds,
        pendingParticipantUsernames: nextPNames,
      });
      return;
    }

    if (ids.length >= required) throw new Error('Quest is full');

    const nextIds = [...ids, participantUserId];
    const nextNames = [...names, participantName];
    while (nextNames.length < nextIds.length) nextNames.push('Participant');

    const filled = nextIds.length >= required;
    const nextStatus = filled ? 'in_progress' : 'open';

    const payload: Record<string, unknown> = {
      participantIds: nextIds,
      participantUsernames: nextNames,
      pendingParticipantIds: nextPIds,
      pendingParticipantUsernames: nextPNames,
      participantsRequired: required,
      status: nextStatus,
      progress: typeof d.progress === 'number' ? d.progress : 0,
    };

    if (legacy) {
      payload.acceptedByUserId = deleteField();
      payload.acceptedByUsername = deleteField();
    }

    transaction.update(ref, payload);
  });
}

export async function createQuest(
  authorId: string,
  authorUsername: string,
  input: {
    title: string;
    description: string;
    lat: number;
    lng: number;
    participantsRequired?: number;
    requireHostApproval?: boolean;
  },
): Promise<void> {
  const required = Math.min(100, Math.max(1, Math.floor(input.participantsRequired ?? 1)));
  const requireHostApproval = input.requireHostApproval === true;
  await addDoc(collection(getDb(), 'quests'), {
    authorId,
    authorUsername,
    title: input.title.trim() || 'Quest',
    description: input.description.trim(),
    lat: input.lat,
    lng: input.lng,
    status: 'open',
    progress: 0,
    participantsRequired: required,
    participantIds: [],
    participantUsernames: [],
    requireHostApproval,
    pendingParticipantIds: [],
    pendingParticipantUsernames: [],
    createdAt: serverTimestamp(),
  });
}

export async function setQuestProgressByAuthor(
  questId: string,
  authorId: string,
  progress: number,
): Promise<void> {
  const ref = doc(getDb(), 'quests', questId);
  const one = await getDoc(ref);
  if (!one.exists()) return;
  const d = one.data() as Record<string, unknown>;
  if (String(d.authorId) !== authorId) return;
  const p = Math.min(100, Math.max(0, Math.round(progress)));
  await updateDoc(ref, { progress: p });
}

function historyPayload(
  questId: string,
  title: string,
  description: string,
  authorUsername: string,
  userId: string,
  role: 'author' | 'participant',
  outcome: 'succeeded' | 'failed',
) {
  return {
    userId,
    questId,
    questTitle: title,
    questDescription: description,
    authorUsername,
    role,
    outcome,
    completedAt: serverTimestamp(),
  };
}

export async function markQuestCompleteByAuthor(questId: string, authorId: string): Promise<void> {
  const ref = doc(getDb(), 'quests', questId);
  const one = await getDoc(ref);
  if (!one.exists()) return;
  const d = one.data() as Record<string, unknown>;
  if (String(d.authorId) !== authorId) return;
  if (d.status !== 'in_progress') return;
  const title = typeof d.title === 'string' ? d.title : 'Quest';
  const description = typeof d.description === 'string' ? d.description : '';
  const authorUsername = typeof d.authorUsername === 'string' ? d.authorUsername : '';

  let participantIds = asStringArray(d.participantIds);
  const legacy = typeof d.acceptedByUserId === 'string' ? d.acceptedByUserId : '';
  if (participantIds.length === 0 && legacy) participantIds = [legacy];
  const names = asStringArray(d.participantUsernames);

  const batch = writeBatch(getDb());
  batch.update(ref, {
    status: 'completed',
    progress: 100,
    completedAt: serverTimestamp(),
    ...(participantIds.length === 1
      ? {
          completedByUserId: participantIds[0],
          completedByUsername:
            names[0] ?? (typeof d.acceptedByUsername === 'string' ? d.acceptedByUsername : 'Participant'),
        }
      : {}),
  });

  const histRefAuthor = doc(collection(getDb(), 'questHistory'));
  batch.set(
    histRefAuthor,
    historyPayload(questId, title, description, authorUsername, authorId, 'author', 'succeeded'),
  );

  for (let i = 0; i < participantIds.length; i++) {
    const uid = participantIds[i];
    const histRef = doc(collection(getDb(), 'questHistory'));
    batch.set(
      histRef,
      historyPayload(questId, title, description, authorUsername, uid, 'participant', 'succeeded'),
    );
  }

  await batch.commit();
}

export async function markQuestFailedByAuthor(questId: string, authorId: string): Promise<void> {
  const ref = doc(getDb(), 'quests', questId);
  const one = await getDoc(ref);
  if (!one.exists()) return;
  const d = one.data() as Record<string, unknown>;
  if (String(d.authorId) !== authorId) return;
  if (d.status !== 'in_progress') return;
  const title = typeof d.title === 'string' ? d.title : 'Quest';
  const description = typeof d.description === 'string' ? d.description : '';
  const authorUsername = typeof d.authorUsername === 'string' ? d.authorUsername : '';

  let participantIds = asStringArray(d.participantIds);
  const legacy = typeof d.acceptedByUserId === 'string' ? d.acceptedByUserId : '';
  if (participantIds.length === 0 && legacy) participantIds = [legacy];

  const batch = writeBatch(getDb());
  batch.update(ref, {
    status: 'failed',
    progress: typeof d.progress === 'number' ? d.progress : 0,
    completedAt: serverTimestamp(),
  });

  const histRefAuthor = doc(collection(getDb(), 'questHistory'));
  batch.set(
    histRefAuthor,
    historyPayload(questId, title, description, authorUsername, authorId, 'author', 'failed'),
  );

  for (const uid of participantIds) {
    const histRef = doc(collection(getDb(), 'questHistory'));
    batch.set(
      histRef,
      historyPayload(questId, title, description, authorUsername, uid, 'participant', 'failed'),
    );
  }

  await batch.commit();
}

export async function reopenQuestByAuthor(questId: string, authorId: string): Promise<void> {
  const ref = doc(getDb(), 'quests', questId);
  const one = await getDoc(ref);
  if (!one.exists()) return;
  const d = one.data() as Record<string, unknown>;
  if (String(d.authorId) !== authorId) return;
  const required =
    typeof d.participantsRequired === 'number' && Number.isFinite(d.participantsRequired)
      ? Math.min(100, Math.max(1, Math.floor(d.participantsRequired)))
      : 1;
  await updateDoc(ref, {
    status: 'open',
    progress: 0,
    participantIds: [],
    participantUsernames: [],
    pendingParticipantIds: [],
    pendingParticipantUsernames: [],
    participantsRequired: required,
    acceptedByUserId: deleteField(),
    acceptedByUsername: deleteField(),
    completedAt: deleteField(),
    completedByUserId: deleteField(),
    completedByUsername: deleteField(),
  });
}

export async function fetchQuestHistory(userId: string, max = 40): Promise<QuestHistoryItem[]> {
  const q2 = query(collection(getDb(), 'questHistory'), where('userId', '==', userId));
  const snap2 = await getDocs(q2);
  const rows: QuestHistoryItem[] = [];
  snap2.forEach((d) => {
    const x = d.data();
    const outcomeRaw = x.outcome;
    const roleRaw = x.role;
    rows.push({
      id: d.id,
      userId: String(x.userId ?? ''),
      questId: String(x.questId ?? ''),
      questTitle: typeof x.questTitle === 'string' ? x.questTitle : 'Quest',
      questDescription: typeof x.questDescription === 'string' ? x.questDescription : '',
      authorUsername: typeof x.authorUsername === 'string' ? x.authorUsername : '',
      role: roleRaw === 'author' || roleRaw === 'participant' ? roleRaw : 'participant',
      outcome:
        outcomeRaw === 'failed' ? 'failed' : outcomeRaw === 'succeeded' ? 'succeeded' : 'succeeded',
      completedAt:
        x.completedAt && typeof x.completedAt === 'object' && 'toMillis' in x.completedAt
          ? (x.completedAt as { toMillis: () => number }).toMillis()
          : 0,
    });
  });
  rows.sort((a, b) => b.completedAt - a.completedAt);
  return rows.slice(0, max);
}

export async function fetchMyPostedQuests(authorId: string): Promise<QuestDoc[]> {
  const qy = query(collection(getDb(), 'quests'), where('authorId', '==', authorId));
  const snap = await getDocs(qy);
  const list: QuestDoc[] = [];
  snap.forEach((d) => {
    const q = parseQuest(d.id, d.data() as Record<string, unknown>);
    if (q) list.push(q);
  });
  list.sort((a, b) => questTimeMs(b) - questTimeMs(a));
  return list;
}
