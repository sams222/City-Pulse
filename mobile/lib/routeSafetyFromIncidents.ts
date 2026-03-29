export type IncidentPoint = { lat: number; lng: number; timeMs: number };

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function distPointToSegmentM(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  // Approximate with euclidean on small distances using lat/lng degrees * meters
  const toM = (lat: number, lng: number) => ({
    x: lng * 85000 * Math.cos((lat * Math.PI) / 180),
    y: lat * 111000,
  });
  const P = toM(p.lat, p.lng);
  const A = toM(a.lat, a.lng);
  const B = toM(b.lat, b.lng);
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  const apx = P.x - A.x;
  const apy = P.y - A.y;
  const ab2 = abx * abx + aby * aby || 1e-9;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = A.x + t * abx;
  const cy = A.y + t * aby;
  return Math.hypot(P.x - cx, P.y - cy);
}

const CORRIDOR_M = 350;
const HALF_LIFE_DAYS = 18;

/**
 * 0–100 safety score: higher is safer. Penalizes recent incidents near the path.
 */
export function safetyScoreAlongRoute(
  path: { lat: number; lng: number }[],
  incidents: IncidentPoint[],
  nowMs: number = Date.now(),
): number {
  if (path.length < 2) return 85;
  let penalty = 0;
  for (const inc of incidents) {
    let minD = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const d = distPointToSegmentM(inc, path[i], path[i + 1]);
      if (d < minD) minD = d;
    }
    if (minD > CORRIDOR_M) continue;
    const proximity = Math.max(0, 1 - minD / CORRIDOR_M);
    const ageDays = Math.max(0, (nowMs - inc.timeMs) / 86400000);
    const recency = Math.exp(-ageDays / HALF_LIFE_DAYS);
    penalty += 22 * proximity * recency;
  }
  return Math.round(Math.max(0, Math.min(100, 100 - penalty)));
}
