/**
 * Transit / directions attempts — console + `window.__CITYPULSE_ROUTING_LOG__` (web),
 * and in-app UI via `subscribeRoutingLog` (Profile → Routing log) so production builds can show logs.
 */

export type RoutingLogEntry = {
  ts: string;
  phase: string;
  message: string;
  data?: Record<string, unknown>;
};

const MAX_ENTRIES = 100;
const ring: RoutingLogEntry[] = [];
const listeners = new Set<(entries: RoutingLogEntry[]) => void>();

function notifyListeners(): void {
  const snap = [...ring];
  listeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function logRouting(phase: string, message: string, data?: Record<string, unknown>): void {
  const entry: RoutingLogEntry = {
    ts: new Date().toISOString(),
    phase,
    message,
    data,
  };
  ring.push(entry);
  while (ring.length > MAX_ENTRIES) ring.shift();

  const label = `[CityPulse][Routing][${phase}] ${message}`;
  if (data && Object.keys(data).length > 0) {
    console.info(label, data);
  } else {
    console.info(label);
  }

  if (typeof window !== 'undefined') {
    (window as unknown as { __CITYPULSE_ROUTING_LOG__?: RoutingLogEntry[] }).__CITYPULSE_ROUTING_LOG__ = [
      ...ring,
    ];
  }

  notifyListeners();
}

export function getRoutingLogSnapshot(): RoutingLogEntry[] {
  return [...ring];
}

/** Subscribe to log updates (called after each new entry and when log is cleared). Returns unsubscribe. */
export function subscribeRoutingLog(onChange: (entries: RoutingLogEntry[]) => void): () => void {
  listeners.add(onChange);
  onChange(getRoutingLogSnapshot());
  return () => listeners.delete(onChange);
}

export function clearRoutingLog(): void {
  ring.length = 0;
  if (typeof window !== 'undefined') {
    (window as unknown as { __CITYPULSE_ROUTING_LOG__?: RoutingLogEntry[] }).__CITYPULSE_ROUTING_LOG__ = [];
  }
  notifyListeners();
}
