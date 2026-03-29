import { Platform } from 'react-native';

import { decodeGooglePolyline } from '@/lib/decodePolyline';
import { logRouting } from '@/lib/routingLog';
import { loadGoogleMapsScript, wasGoogleMapsAuthRejected } from '@/lib/loadGoogleMapsForWeb';
import { googleMapsJavascriptApiKey, googleMapsRoutesApiKey } from '@/lib/mapsEnv';
import type { IncidentPoint } from '@/lib/routeSafetyFromIncidents';
import { safetyScoreAlongRoute } from '@/lib/routeSafetyFromIncidents';

/** One leg of the trip: walking or a transit ride (train/bus/etc.). */
export type TransitSegment =
  | {
      kind: 'walk';
      summary: string;
      distanceText?: string;
      durationText?: string;
    }
  | {
      kind: 'transit';
      /** Line badge, e.g. N, Q, M15 */
      lineShortName: string;
      lineName: string;
      vehicleLabel: string;
      /** Human label: Subway, Bus, Train, … */
      modeLabel: string;
      headsign?: string;
      departureStop: string;
      arrivalStop: string;
      /** Stops passed while on board (per Google Directions). */
      numStops: number;
      durationText?: string;
    };

export type TransitRouteResult = {
  id: string;
  summary: string;
  durationText: string;
  durationSec: number;
  arrivalText?: string;
  /** 0–100, higher safer (incidents near path + recency). */
  safetyScore: number;
  path: { lat: number; lng: number }[];
  /** Ordered walking vs transit portions with stop names and lines. */
  segments: TransitSegment[];
};

type RestTransitLine = {
  short_name?: string;
  name?: string;
  vehicle?: { name?: string; type?: string };
};

type RestStep = {
  travel_mode?: string;
  html_instructions?: string;
  distance?: { text?: string };
  duration?: { text?: string };
  /** Per-step shape when `overview_polyline` is missing (common for some transit responses). */
  polyline?: { points?: string };
  transit_details?: {
    line?: RestTransitLine;
    departure_stop?: { name?: string };
    arrival_stop?: { name?: string };
    num_stops?: number;
    headsign?: string;
  };
};

type DirLeg = {
  duration: { value: number; text: string };
  arrival_time?: { text: string };
  steps?: RestStep[];
};

type DirRoute = {
  summary?: string;
  legs: DirLeg[];
  overview_polyline?: { points: string };
};

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

function modeLabelFromVehicleType(type?: string): string {
  if (!type) return 'Transit';
  const u = type.toUpperCase();
  if (u.includes('BUS')) return 'Bus';
  if (u.includes('SUBWAY')) return 'Subway';
  if (u.includes('TRAM')) return 'Tram';
  if (u.includes('FERRY')) return 'Ferry';
  if (u.includes('RAIL') || u.includes('TRAIN') || u.includes('HEAVY_RAIL') || u.includes('COMMUTER')) {
    return 'Train';
  }
  if (u.includes('MONORAIL')) return 'Monorail';
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseRestStep(step: RestStep): TransitSegment | null {
  const mode = (step.travel_mode || '').toUpperCase();
  if (mode === 'WALKING') {
    const raw = step.html_instructions ? stripHtml(step.html_instructions) : '';
    return {
      kind: 'walk',
      summary: raw || 'Walk',
      distanceText: step.distance?.text,
      durationText: step.duration?.text,
    };
  }
  if (mode === 'TRANSIT' && step.transit_details) {
    const td = step.transit_details;
    const line = td.line ?? {};
    const shortName = (line.short_name || line.name || 'Line').trim();
    const lineName = (line.name || shortName).trim();
    const vehicle = line.vehicle ?? {};
    const modeLabel = modeLabelFromVehicleType(
      typeof vehicle.type === 'string' ? vehicle.type : undefined,
    );
    const vehicleLabel =
      typeof vehicle.name === 'string' && vehicle.name.trim()
        ? vehicle.name.trim()
        : modeLabel;
    return {
      kind: 'transit',
      lineShortName: shortName,
      lineName,
      vehicleLabel,
      modeLabel,
      headsign: typeof td.headsign === 'string' ? td.headsign.trim() : undefined,
      departureStop: td.departure_stop?.name?.trim() || '—',
      arrivalStop: td.arrival_stop?.name?.trim() || '—',
      numStops: typeof td.num_stops === 'number' ? td.num_stops : 0,
      durationText: step.duration?.text,
    };
  }
  return null;
}

function segmentsFromRestLeg(leg: DirLeg): TransitSegment[] {
  const steps = leg.steps ?? [];
  const out: TransitSegment[] = [];
  for (const step of steps) {
    const seg = parseRestStep(step);
    if (seg) out.push(seg);
  }
  return out;
}

function legSummary(leg: DirLeg): string {
  const steps = leg.steps ?? [];
  const parts = steps
    .filter((s) => (s.travel_mode || '').toUpperCase() === 'TRANSIT')
    .slice(0, 4)
    .map((s) => stripHtml(s.html_instructions ?? ''))
    .filter(Boolean);
  if (parts.length) return parts.join(' → ');
  return 'Transit';
}

function parseGoogleJsStep(step: google.maps.DirectionsStep): TransitSegment | null {
  const tm = step.travel_mode;
  if (tm === google.maps.TravelMode.WALKING) {
    const raw = step.instructions ? stripHtml(step.instructions) : '';
    return {
      kind: 'walk',
      summary: raw || 'Walk',
      distanceText: step.distance?.text,
      durationText: step.duration?.text,
    };
  }
  if (tm === google.maps.TravelMode.TRANSIT) {
    const td = step.transit ?? step.transit_details;
    if (!td) return null;
    const line = td.line;
    const shortName = (line.short_name || line.name || 'Line').trim();
    const lineName = (line.name || shortName).trim();
    const vehicle = line.vehicle;
    const modeLabel = modeLabelFromVehicleType(vehicle?.type);
    const vehicleLabel =
      vehicle?.name && String(vehicle.name).trim()
        ? String(vehicle.name).trim()
        : modeLabel;
    return {
      kind: 'transit',
      lineShortName: shortName,
      lineName,
      vehicleLabel,
      modeLabel,
      headsign: td.headsign?.trim(),
      departureStop: td.departure_stop?.name?.trim() || '—',
      arrivalStop: td.arrival_stop?.name?.trim() || '—',
      numStops: typeof td.num_stops === 'number' ? td.num_stops : 0,
      durationText: step.duration?.text,
    };
  }
  return null;
}

function segmentsFromGoogleJsLeg(leg: google.maps.DirectionsLeg): TransitSegment[] {
  const steps = leg.steps ?? [];
  const out: TransitSegment[] = [];
  for (let i = 0; i < steps.length; i++) {
    const seg = parseGoogleJsStep(steps[i]);
    if (seg) out.push(seg);
  }
  return out;
}

/**
 * Web: Maps JavaScript `DirectionsService` (no CORS). Native: REST Directions JSON.
 * Map tiles use Maps JavaScript API; routing is billed under the separate **Directions API** — enable it in Cloud Console.
 */
const DIRECTIONS_API_SETUP_HINT =
  'Enable “Directions API” under APIs & Services → Library (separate from Maps JavaScript API). Billing must be on. If your key uses API restrictions, include both “Maps JavaScript API” and “Directions API” — enabling the product alone is not enough if the key is restricted to Maps only.';

function directionsStatusMessage(status: google.maps.DirectionsStatus): string {
  const s = String(status);
  switch (status) {
    case google.maps.DirectionsStatus.REQUEST_DENIED:
      return `Transit routing was denied. ${DIRECTIONS_API_SETUP_HINT}`;
    case google.maps.DirectionsStatus.OVER_QUERY_LIMIT:
      return 'Directions quota exceeded. Try again later.';
    case google.maps.DirectionsStatus.ZERO_RESULTS:
      return 'No transit routes found for this trip. Try a different time or destination.';
    case google.maps.DirectionsStatus.NOT_FOUND:
      return 'Could not find that origin or destination.';
    case google.maps.DirectionsStatus.INVALID_REQUEST:
      return 'Invalid directions request.';
    case google.maps.DirectionsStatus.UNKNOWN_ERROR:
      return 'Directions service error. Try again.';
    default:
      if (s === 'MAX_WAYPOINTS_EXCEEDED') {
        return 'Directions request exceeded waypoint limits.';
      }
      return `Could not load transit routes (${s}). ${DIRECTIONS_API_SETUP_HINT}`;
  }
}

/** Transit legs sometimes omit `overview_path`; build a drawable path from step geometry. */
function pathFromGoogleJsRoute(
  route: google.maps.DirectionsRoute,
  leg: google.maps.DirectionsLeg,
): { lat: number; lng: number }[] {
  const overview = route.overview_path;
  if (overview && overview.length >= 2) {
    const path: { lat: number; lng: number }[] = [];
    for (let i = 0; i < overview.length; i++) {
      const ll = overview[i];
      path.push({ lat: ll.lat(), lng: ll.lng() });
    }
    return path;
  }
  const fromSteps: { lat: number; lng: number }[] = [];
  for (const step of leg.steps ?? []) {
    const pts = step.path;
    if (!pts?.length) continue;
    for (let i = 0; i < pts.length; i++) {
      const ll = pts[i];
      const p = { lat: ll.lat(), lng: ll.lng() };
      const prev = fromSteps[fromSteps.length - 1];
      if (
        prev &&
        Math.abs(prev.lat - p.lat) < 1e-9 &&
        Math.abs(prev.lng - p.lng) < 1e-9
      ) {
        continue;
      }
      fromSteps.push(p);
    }
  }
  if (fromSteps.length >= 2) return fromSteps;
  const s = leg.start_location;
  const e = leg.end_location;
  if (s && e) {
    return [
      { lat: s.lat(), lng: s.lng() },
      { lat: e.lat(), lng: e.lng() },
    ];
  }
  return [];
}

function pathFromRestRoute(route: DirRoute, leg: DirLeg): { lat: number; lng: number }[] {
  const enc = route.overview_polyline?.points;
  if (enc) {
    const p = decodeGooglePolyline(enc).map((x) => ({ lat: x.lat, lng: x.lng }));
    if (p.length >= 2) return p;
  }
  const out: { lat: number; lng: number }[] = [];
  for (const step of leg.steps ?? []) {
    const pe = step.polyline?.points;
    if (!pe) continue;
    const part = decodeGooglePolyline(pe);
    for (const pt of part) {
      const prev = out[out.length - 1];
      if (
        prev &&
        Math.abs(prev.lat - pt.lat) < 1e-9 &&
        Math.abs(prev.lng - pt.lng) < 1e-9
      ) {
        continue;
      }
      out.push({ lat: pt.lat, lng: pt.lng });
    }
  }
  if (out.length >= 2) return out;
  return [];
}

const WEB_MAPS_KEY_MISSING_MSG =
  'No Google Maps key in this build. Set GOOGLE_MAPS_API_KEY in City-Pulse/.env and run npm run export:web before deploy (the key is baked in at build time).';

function webMapsKeyRejectedMsg(): string {
  const here =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/*`
      : 'https://YOUR-SITE.web.app/*';
  return `Google blocked Maps on this site. In Google Cloud → Credentials → your browser key → Website restrictions, add ${here}. Enable Maps JavaScript API and Directions API; billing must be on.`;
}

async function fetchTransitRoutesWebMapsJs(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  incidents: IncidentPoint[],
): Promise<{ routes: TransitRouteResult[]; errorMessage?: string }> {
  logRouting('directions_web', 'DirectionsService request starting', {
    origin,
    destination: dest,
  });
  const key = googleMapsJavascriptApiKey();
  if (typeof window === 'undefined') {
    logRouting('directions_web', 'Aborted: no window', {});
    return { routes: [], errorMessage: WEB_MAPS_KEY_MISSING_MSG };
  }
  if (!key) {
    logRouting('directions_web', 'Aborted: no API key in bundle', {});
    return { routes: [], errorMessage: WEB_MAPS_KEY_MISSING_MSG };
  }
  if (wasGoogleMapsAuthRejected()) {
    logRouting('directions_web', 'Aborted: Maps key rejected earlier (gm_authFailure)', {});
    return { routes: [], errorMessage: webMapsKeyRejectedMsg() };
  }
  try {
    await loadGoogleMapsScript(key);
  } catch (e) {
    logRouting('directions_web', 'Maps script load failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { routes: [], errorMessage: 'Could not load Google Maps.' };
  }
  if (!window.google?.maps) {
    logRouting('directions_web', 'google.maps missing after script', {});
    return { routes: [], errorMessage: 'Google Maps failed to load.' };
  }

  const service = new google.maps.DirectionsService();
  const request: google.maps.DirectionsRequest = {
    origin: { lat: origin.lat, lng: origin.lng },
    destination: { lat: dest.lat, lng: dest.lng },
    travelMode: google.maps.TravelMode.TRANSIT,
    provideRouteAlternatives: true,
    transitOptions: { departureTime: new Date() },
    /** Bias geocoding / routing to US (NYC-focused app). */
    region: 'us',
  };

  return new Promise((resolve) => {
    service.route(request, (result, status) => {
      if (status !== google.maps.DirectionsStatus.OK || !result?.routes?.length) {
        const errMsg = directionsStatusMessage(status);
        logRouting('directions_web', 'DirectionsService callback: no routes', {
          googleStatus: String(status),
          routeCount: result?.routes?.length ?? 0,
          userMessage: errMsg,
        });
        resolve({
          routes: [],
          errorMessage: errMsg,
        });
        return;
      }
      const out: TransitRouteResult[] = [];
      result.routes.forEach((route, idx) => {
        const leg = route.legs?.[0];
        if (!leg) return;
        const segments = segmentsFromGoogleJsLeg(leg);
        const path = pathFromGoogleJsRoute(route, leg);
        if (path.length < 2) return;
        const stepSummary = leg.steps
          ?.filter((s) => s.travel_mode === google.maps.TravelMode.TRANSIT)
          .slice(0, 4)
          .map((s) => stripHtml(s.instructions ?? ''))
          .filter(Boolean)
          .join(' → ');
        const summary = (route.summary ?? '').trim() || stepSummary || 'Transit';
        const arrivalText = leg.arrival_time?.text;
        const dur = leg.duration;
        if (!dur) return;
        const safetyScore = safetyScoreAlongRoute(path, incidents);
        out.push({
          id: `transit-${idx}`,
          summary,
          durationText: dur.text,
          durationSec: dur.value,
          arrivalText,
          safetyScore,
          path,
          segments,
        });
      });
      if (out.length === 0) {
        const errMsg =
          'No usable transit route geometry returned. Try another time or destination, or confirm Directions API is enabled.';
        logRouting('directions_web', 'OK status but no usable route geometry after parse', {
          rawRouteCount: result.routes?.length ?? 0,
        });
        resolve({
          routes: [],
          errorMessage: errMsg,
        });
        return;
      }
      logRouting('directions_web', 'Success', {
        routeCount: out.length,
        firstSummary: out[0]?.summary,
      });
      resolve({ routes: out });
    });
  });
}

function restDirectionsErrorMessage(status: string, errorMessage?: string): string {
  if (status === 'REQUEST_DENIED') {
    return errorMessage?.trim()
      ? errorMessage
      : `Request denied. ${DIRECTIONS_API_SETUP_HINT}`;
  }
  if (status === 'OVER_QUERY_LIMIT') {
    return 'Directions quota exceeded. Try again later.';
  }
  if (status === 'ZERO_RESULTS') {
    return 'No transit routes found. Try another time or destination.';
  }
  if (status === 'NOT_FOUND') {
    return 'Could not geocode origin or destination.';
  }
  if (status === 'INVALID_REQUEST') {
    return errorMessage?.trim() || 'Invalid directions request.';
  }
  return errorMessage?.trim() || `Directions failed (${status}). Enable the Directions API (transit) for your key.`;
}

export type TransitRoutesFetchResult = {
  routes: TransitRouteResult[];
  /** Present when no routes could be computed (API error, zero results, etc.). */
  errorMessage?: string;
};

async function fetchTransitRoutesRest(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  incidents: IncidentPoint[],
): Promise<TransitRoutesFetchResult> {
  const key = googleMapsRoutesApiKey();
  if (!key) {
    return {
      routes: [],
      errorMessage:
        'Set GOOGLE_MAPS_ROUTES_API_KEY (or GOOGLE_MAPS_API_KEY) in City-Pulse/.env for directions.',
    };
  }

  const departure = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    mode: 'transit',
    alternatives: 'true',
    departure_time: String(departure),
    region: 'us',
    key,
  });

  logRouting('directions_rest', 'GET directions/json (transit)', {
    departure_time: departure,
    keySource: 'GOOGLE_MAPS_ROUTES_API_KEY',
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
  if (!res.ok) {
    logRouting('directions_rest', 'HTTP error', { status: res.status });
    return { routes: [], errorMessage: `Directions request failed (${res.status}).` };
  }
  const data = (await res.json()) as {
    status: string;
    routes?: DirRoute[];
    error_message?: string;
  };
  if (data.status !== 'OK' || !data.routes?.length) {
    const errMsg = restDirectionsErrorMessage(data.status, data.error_message);
    logRouting('directions_rest', 'API returned no routes', {
      status: data.status,
      googleError: data.error_message ?? null,
      userMessage: errMsg,
    });
    return {
      routes: [],
      errorMessage: errMsg,
    };
  }

  const out: TransitRouteResult[] = [];
  data.routes.forEach((route, idx) => {
    const leg = route.legs?.[0];
    if (!leg) return;
    const path = pathFromRestRoute(route, leg);
    if (path.length < 2) return;
    const segments = segmentsFromRestLeg(leg);
    const summary = route.summary?.trim() || legSummary(leg);
    const safetyScore = safetyScoreAlongRoute(path, incidents);
    out.push({
      id: `transit-${idx}`,
      summary,
      durationText: leg.duration.text,
      durationSec: leg.duration.value,
      arrivalText: leg.arrival_time?.text,
      safetyScore,
      path,
      segments,
    });
  });
  logRouting('directions_rest', 'Success', { routeCount: out.length, firstSummary: out[0]?.summary });
  return { routes: out };
}

export async function fetchTransitRoutesWithSafety(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  incidents: IncidentPoint[],
): Promise<TransitRoutesFetchResult> {
  logRouting('directions', 'fetchTransitRoutesWithSafety', {
    platform: Platform.OS,
    origin,
    destination: dest,
    incidentSampleSize: incidents.length,
  });
  const routesKey = googleMapsRoutesApiKey();
  if (!routesKey) {
    logRouting('directions', 'Missing routes/maps API key', { platform: Platform.OS });
    return {
      routes: [],
      errorMessage:
        Platform.OS === 'web'
          ? WEB_MAPS_KEY_MISSING_MSG
          : 'Google Maps API key is not configured (GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_ROUTES_API_KEY).',
    };
  }

  if (Platform.OS === 'web') {
    try {
      return await fetchTransitRoutesRest(origin, dest, incidents);
    } catch (e) {
      logRouting('directions', 'Transit REST failed on web (often CORS); falling back to DirectionsService', {
        error: e instanceof Error ? e.message : String(e),
      });
      return fetchTransitRoutesWebMapsJs(origin, dest, incidents);
    }
  }

  return fetchTransitRoutesRest(origin, dest, incidents);
}
