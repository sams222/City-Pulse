import { useEffect, useState } from 'react';

import { fetchPublicRestroomPins, type BathroomPin } from '@/lib/fetchPublicRestrooms';

export function useMapExtraLayers() {
  const [bathrooms, setBathrooms] = useState<BathroomPin[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pins = await fetchPublicRestroomPins(250);
      if (!cancelled) setBathrooms(pins);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { bathrooms };
}
