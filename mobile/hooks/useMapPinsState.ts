import { useCallback, useEffect, useState } from 'react';

import { fetchMapPins, type MapPin } from '@/lib/firestoreFeed';
import { isFirebaseConfigured } from '@/lib/firebase';

export function useMapPinsState() {
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setError('Add Firebase env vars in mobile/.env (see .env.example).');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMapPins(60);
      setPins(data.filter((p) => p.kind === 'event' || p.kind === 'incident'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load map data. Check Firestore rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { pins, loading, error, load };
}

export function markerColor(kind: MapPin['kind']) {
  switch (kind) {
    case 'event':
      return '#22c55e';
    case 'incident':
      return '#ef4444';
    default:
      return '#64748b';
  }
}
