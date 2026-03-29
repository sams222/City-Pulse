import { collection, getDocs, limit, query } from 'firebase/firestore';

import { extractNycPlaceLabel, fetchNotifyNycLiveNews, fetchSupplementalNycNews } from '@/lib/nycCityNewsFeed';
import { getDb } from '@/lib/firebase';

export type CityNewsItem = {
  id: string;
  headline: string;
  summary: string;
  /** Longer plain text when available (e.g. RSS body). */
  description?: string;
  link: string;
  source?: string;
  publishedAtMs: number;
  category?: string;
  imageUrl?: string;
  /** Only when headline/body explicitly mention a NYC place — never invented. */
  placeLabel?: string;
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

async function fetchCityNewsFromFirestore(max: number): Promise<CityNewsItem[]> {
  const snap = await getDocs(query(collection(getDb(), 'cityNews'), limit(max)));
  const rows: CityNewsItem[] = [];
  snap.forEach((d) => {
    const x = d.data();
    const headline = typeof x.headline === 'string' ? x.headline : 'News';
    const summary = typeof x.summary === 'string' ? x.summary : '';
    const desc = typeof x.description === 'string' ? x.description : undefined;
    const link = typeof x.link === 'string' ? x.link : '';
    const imageUrl = typeof x.imageUrl === 'string' ? x.imageUrl : undefined;
    const placeLabel =
      typeof x.placeLabel === 'string' && x.placeLabel.trim().length > 0 ? x.placeLabel.trim() : undefined;
    const blob = `${headline}\n${summary}${desc ? `\n${desc}` : ''}`;
    const derivedPlace = placeLabel ?? extractNycPlaceLabel(blob);
    rows.push({
      id: d.id,
      headline,
      summary,
      description: desc,
      link,
      source: typeof x.source === 'string' ? x.source : undefined,
      publishedAtMs: toMillis(x.publishedAt),
      category: typeof x.category === 'string' ? x.category : undefined,
      imageUrl,
      placeLabel: derivedPlace,
    });
  });
  rows.sort((a, b) => b.publishedAtMs - a.publishedAtMs);
  return rows;
}

/**
 * Merges Firestore `cityNews` with Notify NYC plus supplemental NYC RSS (deduped by link).
 */
export async function fetchCityNews(max = 30): Promise<CityNewsItem[]> {
  const [fromFs, live, extra] = await Promise.all([
    fetchCityNewsFromFirestore(max).catch(() => [] as CityNewsItem[]),
    fetchNotifyNycLiveNews(max).catch(() => [] as CityNewsItem[]),
    fetchSupplementalNycNews(max).catch(() => [] as CityNewsItem[]),
  ]);

  const byLink = new Map<string, CityNewsItem>();
  for (const r of live) {
    if (r.link) byLink.set(r.link, r);
  }
  for (const r of extra) {
    if (r.link && !byLink.has(r.link)) {
      byLink.set(r.link, r);
    }
  }
  for (const r of fromFs) {
    if (r.link && !byLink.has(r.link)) {
      byLink.set(r.link, r);
    } else if (!r.link) {
      byLink.set(`fs-${r.id}`, r);
    }
  }

  return Array.from(byLink.values())
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
    .slice(0, max);
}
