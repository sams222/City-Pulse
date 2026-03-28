import { nycOpenDataAppToken } from '@/lib/openDataEnv';

/** Emerald pins for NYC Open Data + Citi Bike “positive” activity (distinct from Firestore event green). */
export const OPEN_DATA_POSITIVE_PIN_COLOR = '#34d399';

export type OpenDataPin = {
  id: string;
  source: string;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
};

const SODA = 'https://data.cityofnewyork.us/resource';
const DEFAULT_TIMEOUT_MS = 14_000;

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function nycBounds(lat: number, lng: number): boolean {
  return lat > 40.45 && lat < 40.95 && lng > -74.35 && lng < -73.65;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let to: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    to = setTimeout(() => rej(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(to!);
  }
}

function sodaHeaders(): HeadersInit {
  const token = nycOpenDataAppToken();
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h['X-App-Token'] = token;
  return h;
}

async function sodaJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams(params);
  const url = `${path}?${q.toString()}`;
  const res = await fetch(url, { headers: sodaHeaders() });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`SODA ${res.status}: ${t.slice(0, 120)}`);
  }
  return res.json() as Promise<T>;
}

/** NYC Parks Events Listing — Event Locations (cpcm-i88g). */
async function fetchParksEventLocations(): Promise<OpenDataPin[]> {
  type Row = { event_id?: string; name?: string; lat?: string; long?: string; borough?: string };
  const rows = await sodaJson<Row[]>(`${SODA}/cpcm-i88g.json`, {
    $limit: '120',
    $select: 'event_id,name,lat,long,borough',
  });
  const seen = new Set<string>();
  const out: OpenDataPin[] = [];
  for (const r of rows) {
    const lat = num(r.lat);
    const lng = num(r.long);
    if (lat == null || lng == null || !nycBounds(lat, lng)) continue;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = typeof r.name === 'string' && r.name.length ? r.name : 'Parks location';
    out.push({
      id: `parks-loc-${r.event_id ?? key}`,
      source: 'NYC Parks Events (Open Data)',
      title,
      description: r.borough ? `Borough: ${r.borough}` : undefined,
      latitude: lat,
      longitude: lng,
    });
  }
  return out;
}

/** DOHMH — NYC Farmers Markets (8vwk-6iz2). */
async function fetchFarmersMarkets(): Promise<OpenDataPin[]> {
  type Row = {
    marketname?: string;
    latitude?: string | number;
    longitude?: string | number;
    borough?: string;
    streetaddress?: string;
    year?: string | number;
  };
  const rows = await sodaJson<Row[]>(`${SODA}/8vwk-6iz2.json`, {
    $limit: '120',
    $where: 'year in (2025, 2026)',
    $select: 'marketname,latitude,longitude,borough,streetaddress,year',
  });
  const out: OpenDataPin[] = [];
  rows.forEach((r, i) => {
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    if (lat == null || lng == null || !nycBounds(lat, lng)) return;
    const title =
      typeof r.marketname === 'string' && r.marketname.length ? r.marketname : 'Farmers market';
    const desc = [r.streetaddress, r.borough].filter(Boolean).join(' · ');
    out.push({
      id: `farmers-${i}-${lat.toFixed(4)}`,
      source: 'DOHMH Farmers Markets',
      title,
      description: desc || undefined,
      latitude: lat,
      longitude: lng,
    });
  });
  return out;
}

/**
 * 311 service requests — compliment types only (erm2-nwe9).
 * SoQL with `latitude is not null` is often very slow; we take a small recent slice and filter client-side.
 */
async function fetch311Compliments(): Promise<OpenDataPin[]> {
  type Row = {
    unique_key?: string;
    complaint_type?: string;
    descriptor?: string;
    latitude?: string;
    longitude?: string;
  };
  const rows = await sodaJson<Row[]>(`${SODA}/erm2-nwe9.json`, {
    $limit: '50',
    $select: 'unique_key,complaint_type,descriptor,latitude,longitude',
    $where: "complaint_type like '%Compliment%'",
  });
  const out: OpenDataPin[] = [];
  for (const r of rows) {
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    if (lat == null || lng == null || !nycBounds(lat, lng)) continue;
    const type = typeof r.complaint_type === 'string' ? r.complaint_type : 'Compliment';
    const desc = typeof r.descriptor === 'string' ? r.descriptor : undefined;
    out.push({
      id: `311-${r.unique_key ?? `${lat}-${lng}`}`,
      source: '311 compliments (Open Data)',
      title: type,
      description: desc,
      latitude: lat,
      longitude: lng,
    });
  }
  return out;
}

type GbfsRoot = { data?: { en?: { feeds?: { name: string; url: string }[] } } };

type StationInfo = { station_id: string; name?: string; lat?: number; lon?: number };
type StationInfoResp = { data?: { stations?: StationInfo[] } };

type StationStatus = {
  station_id: string;
  num_bikes_available?: number;
  num_ebikes_available?: number;
  num_docks_available?: number;
};
type StationStatusResp = { data?: { stations?: StationStatus[] } };

/** Citi Bike GBFS — stations with balanced bikes/docks as a simple vitality proxy (snapshot). */
async function fetchCitiBikeVitalityPins(maxPins = 32): Promise<OpenDataPin[]> {
  const gbfsRes = await fetch('https://gbfs.citibikenyc.com/gbfs/gbfs.json');
  if (!gbfsRes.ok) throw new Error(`GBFS discovery ${gbfsRes.status}`);
  const gbfs = (await gbfsRes.json()) as GbfsRoot;
  const feeds = gbfs.data?.en?.feeds ?? [];
  const infoUrl = feeds.find((f) => f.name === 'station_information')?.url;
  const statusUrl = feeds.find((f) => f.name === 'station_status')?.url;
  if (!infoUrl || !statusUrl) throw new Error('GBFS: missing station feeds');

  const [infoR, statusR] = await Promise.all([fetch(infoUrl), fetch(statusUrl)]);
  if (!infoR.ok || !statusR.ok) throw new Error('GBFS: station JSON fetch failed');

  const info = (await infoR.json()) as StationInfoResp;
  const status = (await statusR.json()) as StationStatusResp;
  const stations = info.data?.stations ?? [];
  const byId = new Map<string, StationStatus>();
  for (const s of status.data?.stations ?? []) {
    byId.set(s.station_id, s);
  }

  type Scored = { score: number; pin: OpenDataPin };
  const scored: Scored[] = [];

  for (const s of stations) {
    const lat = typeof s.lat === 'number' ? s.lat : null;
    const lng = typeof s.lon === 'number' ? s.lon : null;
    if (lat == null || lng == null || !nycBounds(lat, lng)) continue;
    const st = byId.get(s.station_id);
    if (!st) continue;
    const bikes = (st.num_bikes_available ?? 0) + (st.num_ebikes_available ?? 0);
    const docks = st.num_docks_available ?? 0;
    const total = bikes + docks;
    if (total < 8) continue;
    const score = bikes * docks;

    scored.push({
      score,
      pin: {
        id: `citibike-${s.station_id}`,
        source: 'Citi Bike (GBFS)',
        title: typeof s.name === 'string' && s.name.length ? s.name : 'Citi Bike station',
        description: `~${bikes} bikes · ~${docks} docks (activity proxy)`,
        latitude: lat,
        longitude: lng,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxPins).map((x) => x.pin);
}

/**
 * Loads geocoded “positive” open data for the map.
 * Not included here (no stable coordinates / wrong signal for green pins): NYPD complaints (qgea-i56i),
 * NYC Permitted Event Information (tvpp-9vvx — text locations only), MTA GTFS-RT (protobuf + API key),
 * Notify NYC (no public geo RSS), MOCJ / CompStat (PDFs or scrape).
 */
export async function fetchOpenDataPositivePins(): Promise<OpenDataPin[]> {
  const ms = DEFAULT_TIMEOUT_MS;

  const results = await Promise.allSettled([
    withTimeout(fetchParksEventLocations(), ms, 'Parks events'),
    withTimeout(fetchFarmersMarkets(), ms, 'Farmers markets'),
    withTimeout(fetch311Compliments(), ms, '311 compliments'),
    withTimeout(fetchCitiBikeVitalityPins(), ms, 'Citi Bike'),
  ]);

  const pins: OpenDataPin[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') pins.push(...r.value);
  }
  return pins;
}
