import { collection, getDocs, limit, orderBy, query, type DocumentData } from 'firebase/firestore';

import { getDb } from '@/lib/firebase';

export type RecommendedEvent = {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  category: string;
  distanceKm?: number;
  score: number;
  lat: number;
  lng: number;
  startTimeMs: number;
  imageUrl?: string;
  hostUserId?: string;
  source?: string;
  link?: string;
};

/** Human-readable category for feed card body (replaces raw snake_case badges). */
export function formatCategoryForDisplay(category: string): string {
  const c = category.trim().toLowerCase();
  if (!c || c === 'general') return '';
  return c
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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

/** Map Firestore event.category to preference ids */
export function eventCategoryToPreference(cat: string): string | null {
  const c = cat.toLowerCase();
  if (c.includes('sport') || c === 'fitness' || c.includes('marathon')) return 'sports';
  if (c.includes('music') || c.includes('concert') || c.includes('jazz') || c.includes('festival')) return 'music';
  if (c.includes('art') || c.includes('gallery') || c.includes('museum') || c.includes('theater')) return 'arts';
  if (c.includes('food') || c.includes('market') || c.includes('greenmarket') || c.includes('tasting')) return 'food';
  if (c.includes('community') || c.includes('volunteer') || c.includes('compliment') || c.includes('meetup')) return 'community';
  if (c.includes('outdoor') || c.includes('park') || c.includes('nature') || c.includes('walk') || c.includes('hike')) return 'outdoor';
  if (c.includes('street_fair') || c.includes('fair')) return 'community';
  return null;
}

/** When category is generic, match title/description against these keywords per preference id. */
const PREFERENCE_KEYWORDS: Record<string, string[]> = {
  sports: ['sport', 'run', 'yoga', 'fitness', 'game', 'stadium', 'marathon', 'soccer', 'basketball', 'tennis', 'gym'],
  music: ['music', 'concert', 'jazz', 'band', 'dj', 'acoustic', 'orchestra', 'singer', 'live music'],
  arts: ['art', 'gallery', 'museum', 'theater', 'theatre', 'exhibit', 'film', 'dance', 'sculpture'],
  food: ['food', 'tasting', 'market', 'restaurant', 'chef', 'culinary', 'wine', 'dinner', 'brunch'],
  community: ['community', 'volunteer', 'meetup', 'neighborhood', 'town hall', 'workshop', 'fundraiser'],
  outdoor: ['park', 'outdoor', 'nature', 'walk', 'hike', 'river', 'garden', 'plaza', 'greenway'],
};

function textMatchesPreferences(blob: string, prefs: string[]): boolean {
  if (prefs.length === 0) return false;
  const t = blob.toLowerCase();
  for (const p of prefs) {
    const words = PREFERENCE_KEYWORDS[p];
    if (!words) continue;
    for (const w of words) {
      if (t.includes(w)) return true;
    }
  }
  return false;
}

/** Strong preference signal: category mapping and/or keyword overlap with selected interests. */
function interestWeight(
  category: string,
  title: string,
  description: string | undefined,
  userPreferences: string[],
): number {
  if (userPreferences.length === 0) return 2;
  const pref = eventCategoryToPreference(category);
  if (pref && userPreferences.includes(pref)) return 12;
  const blob = `${title}\n${description ?? ''}`;
  if (textMatchesPreferences(blob, userPreferences)) return 8;
  return 0;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function pickTitle(data: DocumentData, fallback: string): string {
  const t = data.title ?? data.header;
  return typeof t === 'string' && t.length > 0 ? t : fallback;
}

export async function fetchRecommendedEvents(
  userPreferences: string[],
  userLat: number | null,
  userLng: number | null,
  max = 40,
): Promise<RecommendedEvent[]> {
  const db = getDb();
  const snap = await getDocs(
    query(collection(db, 'events'), orderBy('startTime', 'desc'), limit(80)),
  );
  const rows: RecommendedEvent[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const lat = typeof d.lat === 'number' ? d.lat : Number(d.lat);
    const lng = typeof d.lng === 'number' ? d.lng : Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const category = typeof d.category === 'string' ? d.category : 'general';
    const title = pickTitle(d, 'Event');
    const desc = typeof d.description === 'string' ? d.description : undefined;
    const interest = interestWeight(category, title, desc, userPreferences);
    const dist =
      userLat != null && userLng != null ? haversineKm(userLat, userLng, lat, lng) : undefined;
    const distScore = dist != null ? Math.max(0, 6 - dist / 2.5) : 1.5;
    // With interests selected, non-matching events sink; distance still breaks ties among matches.
    const score =
      userPreferences.length > 0
        ? interest * 4 + distScore + (interest > 0 ? 2 : 0)
        : interest + distScore;
    rows.push({
      id: docSnap.id,
      title,
      subtitle: desc ? desc.slice(0, 140) : undefined,
      description: desc,
      category,
      distanceKm: dist,
      score,
      lat,
      lng,
      startTimeMs: toMillis(d.startTime ?? d.endTime),
      imageUrl: typeof d.imageUrl === 'string' ? d.imageUrl : undefined,
      hostUserId: typeof d.hostUserId === 'string' ? d.hostUserId : undefined,
      source: typeof d.source === 'string' ? d.source : undefined,
      link: typeof d.link === 'string' ? d.link : typeof d.url === 'string' ? d.url : undefined,
    });
  });
  rows.sort((a, b) => b.score - a.score || b.startTimeMs - a.startTimeMs);
  return rows.slice(0, max);
}
