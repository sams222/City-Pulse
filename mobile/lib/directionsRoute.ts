import { googleMapsRoutesApiKey } from '@/lib/mapsEnv';

export type TravelMode = 'walking' | 'driving' | 'bicycling' | 'transit';

export type RouteLegSummary = {
  mode: TravelMode;
  durationText: string;
  durationSec: number;
  distanceText: string;
  /** Heuristic 0–100 from duration + distance (demo; replace with real safety model). */
  safetyIndex: number;
};

function heuristicSafety(durationSec: number, distanceM: number): number {
  const minutes = durationSec / 60;
  const km = distanceM / 1000;
  const stress = Math.min(1, minutes / 45 + km / 8);
  return Math.round(55 + 45 * (1 - stress));
}

/** Uses Google Directions JSON (`GOOGLE_MAPS_ROUTES_API_KEY`, or falls back to the main Maps key). */
export async function fetchRouteSummaries(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  modes: TravelMode[] = ['walking', 'driving', 'bicycling'],
): Promise<RouteLegSummary[]> {
  const key = googleMapsRoutesApiKey();
  if (!key) return [];

  const out: RouteLegSummary[] = [];
  for (const mode of modes) {
    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${dest.lat},${dest.lng}`,
      mode,
      key,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
    if (!res.ok) continue;
    const data = (await res.json()) as {
      status: string;
      routes?: { legs: { duration: { value: number; text: string }; distance: { value: number; text: string } }[] }[];
    };
    if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]) continue;
    const leg = data.routes[0].legs[0];
    out.push({
      mode,
      durationText: leg.duration.text,
      durationSec: leg.duration.value,
      distanceText: leg.distance.text,
      safetyIndex: heuristicSafety(leg.duration.value, leg.distance.value),
    });
  }
  return out;
}
