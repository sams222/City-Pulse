/** Free geocoding (Nominatim). Respect usage policy for production. */
export async function geocodeAddressNyc(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ', New York City')}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CityPulse/1.0 (hackathon; contact@citypulse.app)',
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as { lat: string; lon: string }[];
  if (!rows?.length) return null;
  const lat = Number(rows[0].lat);
  const lng = Number(rows[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
