/**
 * Live NYC public alerts / news via the official Notify NYC RSS feed
 * (https://on.nyc.gov/feed/rss), fetched through rss2json for JSON + CORS-friendly access.
 */

import type { CityNewsItem } from '@/lib/newsService';

const NOTIFY_NYC_RSS = 'https://on.nyc.gov/feed/rss';

/** NYT Metro feed — stable RSS, usable when Notify NYC is slow or empty. */
const NYT_NY_REGION_RSS = 'https://rss.nytimes.com/services/xml/rss/nyt/NYRegion.xml';
/** Gothamist — NYC-focused local coverage. */
const GOTHAMIST_RSS = 'https://gothamist.com/feed';

function stripHtml(s: string): string {
  return s
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstImageFromHtml(html: string): string | undefined {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1]?.trim();
}

/** Only returns a label when the copy explicitly mentions a NYC place (not guessed). */
export function extractNycPlaceLabel(text: string): string | undefined {
  const t = text;
  const checks: { re: RegExp; label: string }[] = [
    { re: /\bStaten Island\b/i, label: 'Staten Island' },
    { re: /\bManhattan\b/i, label: 'Manhattan' },
    { re: /\bBrooklyn\b/i, label: 'Brooklyn' },
    { re: /\bQueens\b/i, label: 'Queens' },
    { re: /\b(?:the )?Bronx\b/i, label: 'Bronx' },
    { re: /\bNew York City\b/i, label: 'New York City' },
    { re: /\bNYC\b/, label: 'NYC' },
  ];
  for (const { re, label } of checks) {
    if (re.test(t)) return label;
  }
  return undefined;
}

function stableIdFromLink(link: string, index: number): string {
  let h = 0;
  for (let i = 0; i < link.length; i++) h = (Math.imul(31, h) + link.charCodeAt(i)) | 0;
  return `nyc-rss-${Math.abs(h)}-${index}`;
}

type Rss2JsonItem = {
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  thumbnail?: string;
  enclosure?: { link?: string };
};

type Rss2JsonResponse = {
  status: string;
  items?: Rss2JsonItem[];
};

async function fetchRss2JsonCityNews(
  rssUrl: string,
  sourceLabel: string,
  category: string | undefined,
  max: number,
): Promise<CityNewsItem[]> {
  if (max <= 0) return [];
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`${sourceLabel} feed failed (${res.status})`);
  const data = (await res.json()) as Rss2JsonResponse;
  if (data.status !== 'ok' || !Array.isArray(data.items)) return [];

  const out: CityNewsItem[] = [];
  for (let i = 0; i < Math.min(data.items.length, max); i++) {
    const it = data.items[i];
    const title = typeof it.title === 'string' ? it.title.trim() : 'Alert';
    const rawHtml = typeof it.description === 'string' ? it.description : '';
    const plain = stripHtml(rawHtml);
    const link = typeof it.link === 'string' ? it.link.trim() : '';
    if (!link) continue;
    const publishedAtMs = it.pubDate ? Date.parse(it.pubDate) : Date.now();
    const thumb =
      typeof it.thumbnail === 'string' && it.thumbnail.startsWith('http')
        ? it.thumbnail
        : typeof it.enclosure?.link === 'string' && it.enclosure.link.startsWith('http')
          ? it.enclosure.link
          : firstImageFromHtml(rawHtml);
    const blob = `${title}\n${plain}`;
    const placeLabel = extractNycPlaceLabel(blob);
    out.push({
      id: stableIdFromLink(link, i),
      headline: title,
      summary: plain.length > 320 ? `${plain.slice(0, 317)}…` : plain,
      description: plain.length > 0 ? plain : undefined,
      link,
      source: sourceLabel,
      publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : Date.now(),
      category,
      imageUrl: thumb,
      placeLabel,
    });
  }
  return out;
}

/**
 * Fetches the official Notify NYC RSS feed as structured items (images + body when present).
 */
export async function fetchNotifyNycLiveNews(max: number): Promise<CityNewsItem[]> {
  return fetchRss2JsonCityNews(NOTIFY_NYC_RSS, 'Notify NYC', 'alert', max);
}

/**
 * Additional NYC-oriented RSS sources so the feed stays populated when Notify NYC is quiet.
 */
export async function fetchSupplementalNycNews(max: number): Promise<CityNewsItem[]> {
  const half = Math.max(1, Math.ceil(max / 2));
  const [nyt, goth] = await Promise.all([
    fetchRss2JsonCityNews(NYT_NY_REGION_RSS, 'NYT Metro', 'news', half),
    fetchRss2JsonCityNews(GOTHAMIST_RSS, 'Gothamist', 'news', half),
  ]);
  const merged = [...nyt, ...goth];
  merged.sort((a, b) => b.publishedAtMs - a.publishedAtMs);
  return merged.slice(0, max);
}
