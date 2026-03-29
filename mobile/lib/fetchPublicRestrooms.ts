import { nycOpenDataAppToken } from '@/lib/openDataEnv';

export type BathroomPin = {
  id: string;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
};

const SODA = 'https://data.cityofnewyork.us/resource/i7jb-7jku.json';

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function fetchPublicRestroomPins(limit = 80): Promise<BathroomPin[]> {
  const token = nycOpenDataAppToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['X-App-Token'] = token;

  const q = new URLSearchParams({
    $limit: String(limit),
    $select: 'facility_name,latitude,longitude,location_type,status,operator,hours_of_operation',
  });
  try {
    const res = await fetch(`${SODA}?${q}`, { headers });
    if (!res.ok) return [];

    const raw = await res.json();
    if (!Array.isArray(raw)) return [];

    const rows = raw as Record<string, unknown>[];
    const out: BathroomPin[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let lat = num(r.latitude);
      let lng = num(r.longitude);
      if ((lat == null || lng == null) && r.location_1 && typeof r.location_1 === 'object') {
        const loc = r.location_1 as { coordinates?: unknown };
        const c = loc.coordinates;
        if (Array.isArray(c) && c.length >= 2) {
          lng = num(c[0]);
          lat = num(c[1]);
        }
      }
      if (lat == null || lng == null) continue;
      const name = typeof r.facility_name === 'string' ? r.facility_name : 'Restroom';
      const locType = typeof r.location_type === 'string' ? r.location_type : '';
      const status = typeof r.status === 'string' ? r.status : '';
      const desc = [locType, status].filter(Boolean).join(' · ');
      out.push({
        id: `bathroom-${i}-${lat.toFixed(3)}`,
        title: name,
        description: desc || undefined,
        latitude: lat,
        longitude: lng,
      });
    }
    return out;
  } catch {
    return [];
  }
}
