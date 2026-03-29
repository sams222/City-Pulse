import {
  collection,
  doc,
  getDoc,
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
  /** Set for incidents — used for route safety scoring. */
  reportedAtMs?: number;
};

export type FeedItem = {
  id: string;
  kind: MapPinKind | 'alert';
  title: string;
  subtitle?: string;
  sortTime: number;
  source?: string;
  link?: string;
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
      reportedAtMs: toMillis(d.timestamp),
    });
  });

  return pins;
}

export type EventDetail = {
  id: string;
  title: string;
  description?: string;
  lat: number;
  lng: number;
  category?: string;
  source?: string;
  /** Article or listing URL for rich preview (images, longer text). */
  link?: string;
  imageUrl?: string;
  hostUserId?: string;
  /** Organizer contact (often on user-created events). */
  organizerName?: string;
  organizerEmail?: string;
  organizerPhone?: string;
  startTimeMs: number;
  endTimeMs?: number;
  /** Filled when loaded for UI (subcollection count). */
  interestCount?: number;
};

export async function fetchEventById(id: string): Promise<EventDetail | null> {
  const snap = await getDoc(doc(getDb(), 'events', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
  const lng = typeof d.lng === 'number' ? d.lng : Number(d.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let interestCount = 0;
  try {
    const { getEventInterestCount } = await import('@/lib/eventEngagement');
    interestCount = await getEventInterestCount(id);
  } catch {
    /* ignore */
  }

  return {
    id: snap.id,
    title: pickTitle(d, 'Event'),
    description: typeof d.description === 'string' ? d.description : undefined,
    lat,
    lng,
    category: typeof d.category === 'string' ? d.category : undefined,
    source: typeof d.source === 'string' ? d.source : undefined,
    imageUrl: typeof d.imageUrl === 'string' ? d.imageUrl : undefined,
    hostUserId: typeof d.hostUserId === 'string' ? d.hostUserId : undefined,
    organizerName: typeof d.organizerName === 'string' ? d.organizerName : undefined,
    organizerEmail: typeof d.organizerEmail === 'string' ? d.organizerEmail : undefined,
    organizerPhone: typeof d.organizerPhone === 'string' ? d.organizerPhone : undefined,
    link: typeof d.link === 'string' ? d.link : typeof d.url === 'string' ? d.url : undefined,
    startTimeMs: toMillis(d.startTime ?? d.endTime),
    endTimeMs: d.endTime ? toMillis(d.endTime) : undefined,
    interestCount,
  };
}

export type CommunityPostDetail = {
  id: string;
  title: string;
  description?: string;
  lat: number;
  lng: number;
  placeName?: string;
  authorDisplayName?: string;
  imageUrl?: string;
  link?: string;
};

export async function fetchCommunityPostById(id: string): Promise<CommunityPostDetail | null> {
  const snap = await getDoc(doc(getDb(), 'communityPosts', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
  const lng = typeof d.lng === 'number' ? d.lng : Number(d.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: snap.id,
    title: pickTitle(d, 'Community'),
    description: typeof d.description === 'string' ? d.description : undefined,
    lat,
    lng,
    placeName: typeof d.placeName === 'string' ? d.placeName : undefined,
    authorDisplayName: typeof d.authorDisplayName === 'string' ? d.authorDisplayName : undefined,
    imageUrl: typeof d.imageUrl === 'string' ? d.imageUrl : undefined,
    link: typeof d.link === 'string' ? d.link : typeof d.url === 'string' ? d.url : undefined,
  };
}

export type IncidentDetail = {
  id: string;
  type: string;
  source?: string;
  /** Primary article or data source URL for rich preview. */
  sourceUrl?: string;
  timestamp: number;
  description?: string;
  photoUrl?: string;
};

export async function fetchIncidentById(id: string): Promise<IncidentDetail | null> {
  const snap = await getDoc(doc(getDb(), 'incidents', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    type: typeof d.type === 'string' ? d.type : 'Incident',
    source: typeof d.source === 'string' ? d.source : undefined,
    sourceUrl:
      typeof d.sourceUrl === 'string'
        ? d.sourceUrl
        : typeof d.link === 'string'
          ? d.link
          : typeof d.url === 'string'
            ? d.url
            : undefined,
    timestamp: toMillis(d.timestamp),
    description: typeof d.description === 'string' ? d.description : undefined,
    photoUrl: typeof d.photoUrl === 'string' ? d.photoUrl : undefined,
  };
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
      link: typeof d.link === 'string' ? d.link : typeof d.url === 'string' ? d.url : undefined,
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
      link: typeof d.link === 'string' ? d.link : typeof d.url === 'string' ? d.url : undefined,
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
  sourceUrl?: string;
  timestamp: number;
  description?: string;
  photoUrl?: string;
  /** Present when the incident document has coordinates (map + security zoom). */
  lat?: number;
  lng?: number;
};

export async function fetchIncidents(max = 40): Promise<IncidentRow[]> {
  const db = getDb();
  const qy = query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(max));
  const snap = await getDocs(qy);
  const rows: IncidentRow[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const latRaw = typeof d.lat === 'number' ? d.lat : Number(d.lat);
    const lngRaw = typeof d.lng === 'number' ? d.lng : Number(d.lng);
    const lat = Number.isFinite(latRaw) ? latRaw : undefined;
    const lng = Number.isFinite(lngRaw) ? lngRaw : undefined;
    rows.push({
      id: docSnap.id,
      type: typeof d.type === 'string' ? d.type : 'Incident',
      source: typeof d.source === 'string' ? d.source : undefined,
      sourceUrl:
        typeof d.sourceUrl === 'string'
          ? d.sourceUrl
          : typeof d.link === 'string'
            ? d.link
            : typeof d.url === 'string'
              ? d.url
              : undefined,
      timestamp: toMillis(d.timestamp),
      description: typeof d.description === 'string' ? d.description : undefined,
      photoUrl: typeof d.photoUrl === 'string' ? d.photoUrl : undefined,
      ...(lat != null && lng != null ? { lat, lng } : {}),
    });
  });
  return rows;
}

const NYC_CENTER = { lat: 40.7128, lng: -74.006 };

/** Lat/lng from an incident document, or null if missing. */
export async function fetchIncidentLatLngById(id: string): Promise<{ lat: number; lng: number } | null> {
  const snap = await getDoc(doc(getDb(), 'incidents', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
  const lng = typeof d.lng === 'number' ? d.lng : Number(d.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Lat/lng from a transit service alert document, or null if missing. */
export async function fetchTransitAlertLatLngById(id: string): Promise<{ lat: number; lng: number } | null> {
  const snap = await getDoc(doc(getDb(), 'transitServiceAlerts', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
  const lng = typeof d.lng === 'number' ? d.lng : Number(d.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function getNycMapFallback(): { lat: number; lng: number } {
  return { ...NYC_CENTER };
}
