import { useCallback, useEffect, useState } from 'react';

import {
  fetchOpenDataPositivePins,
  type OpenDataPin,
} from '@/lib/fetchOpenDataPositivePins';

export function useOpenDataPositivePins(enabled: boolean) {
  const [pins, setPins] = useState<OpenDataPin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setPins([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOpenDataPositivePins();
      setPins(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Open data failed');
      setPins([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { openDataPins: pins, openDataLoading: loading, openDataError: error, reloadOpenData: load };
}
