import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

export type MapPinKind = 'event' | 'community' | 'incident';

export type MapPin = {
  id: string;
  kind: MapPinKind;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
};

export type FeedItem = {
  id: string;
  kind: MapPinKind | 'alert';
  title: string;
  subtitle?: string;
  sortTime: number;
  source?: string;
};

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

function pickTitle(data: DocumentData, fallback: string): string {
  const t = data.title ?? data.header ?? data.headline;
  return typeof t === 'string' && t.length > 0 ? t : fallback;
}

export async function fetchMapPins(maxPerCollection = 40): Promise<MapPin[]> {
  const db = getDb();
  const pins: MapPin[] = [];

  const eventSnap = await getDocs(
    query(collection(db, 'events'), orderBy('startTime', 'desc'), limit(maxPerCollection)),
  );
  eventSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
    const lng = typeof d.lng === 'number' ? d.lng : Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    pins.push({
      id: docSnap.id,
      kind: 'event',
      title: pickTitle(d, 'Event'),
      description: typeof d.description === 'string' ? d.description : undefined,
      latitude: lat,
      longitude: lng,
    });
  });

  const postSnap = await getDocs(
    query(
      collection(db, 'communityPosts'),
      orderBy('createdAt', 'desc'),
      limit(maxPerCollection),
    ),
  );
  postSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
    const lng = typeof d.lng === 'number' ? d.lng : Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    pins.push({
      id: docSnap.id,
      kind: 'community',
      title: pickTitle(d, 'Community post'),
      description: typeof d.description === 'string' ? d.description : undefined,
      latitude: lat,
      longitude: lng,
    });
  });

  const incidentSnap = await getDocs(
    query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(maxPerCollection)),
  );
  incidentSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
    const lng = typeof d.lng === 'number' ? d.lng : Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    pins.push({
      id: docSnap.id,
      kind: 'incident',
      title: typeof d.type === 'string' ? d.type : 'Incident',
      description: typeof d.description === 'string' ? d.description : undefined,
      latitude: lat,
      longitude: lng,
    });
  });

  return pins;
}

export async function fetchFeedItems(maxEach = 25): Promise<FeedItem[]> {
  const db = getDb();
  const items: FeedItem[] = [];

  const eventSnap = await getDocs(
    query(collection(db, 'events'), orderBy('startTime', 'desc'), limit(maxEach)),
  );
  eventSnap.forEach((docSnap) => {
    const d = docSnap.data();
    items.push({
      id: docSnap.id,
      kind: 'event',
      title: pickTitle(d, 'Event'),
      subtitle: typeof d.source === 'string' ? d.source : undefined,
      sortTime: toMillis(d.startTime ?? d.endTime),
      source: typeof d.source === 'string' ? d.source : 'event',
    });
  });

  const postSnap = await getDocs(
    query(collection(db, 'communityPosts'), orderBy('createdAt', 'desc'), limit(maxEach)),
  );
  postSnap.forEach((docSnap) => {
    const d = docSnap.data();
    items.push({
      id: docSnap.id,
      kind: 'community',
      title: pickTitle(d, 'Community'),
      subtitle:
        typeof d.placeName === 'string'
          ? d.placeName
          : typeof d.category === 'string'
            ? d.category
            : undefined,
      sortTime: toMillis(d.createdAt),
      source: 'communityPosts',
    });
  });

  const alertSnap = await getDocs(
    query(
      collection(db, 'transitServiceAlerts'),
      orderBy('createdAt', 'desc'),
      limit(maxEach),
    ),
  );
  alertSnap.forEach((docSnap) => {
    const d = docSnap.data();
    items.push({
      id: docSnap.id,
      kind: 'alert',
      title: pickTitle(d, 'Transit alert'),
      subtitle: typeof d.description === 'string' ? d.description.slice(0, 120) : undefined,
      sortTime: toMillis(d.startTime ?? d.createdAt),
      source: 'mta',
    });
  });

  items.sort((a, b) => b.sortTime - a.sortTime);
  return items;
}

export type IncidentRow = {
  id: string;
  type: string;
  source?: string;
  timestamp: number;
  description?: string;
};

export async function fetchIncidents(max = 40): Promise<IncidentRow[]> {
  const db = getDb();
  const qy = query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(max));
  const snap = await getDocs(qy);
  const rows: IncidentRow[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    rows.push({
      id: docSnap.id,
      type: typeof d.type === 'string' ? d.type : 'Incident',
      source: typeof d.source === 'string' ? d.source : undefined,
      timestamp: toMillis(d.timestamp),
      description: typeof d.description === 'string' ? d.description : undefined,
    });
  });
  return rows;
}
