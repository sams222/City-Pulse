import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type MapFocusPayload = { lat: number; lng: number; focusPinId?: string };

type MapFocusContextValue = {
  focusGeneration: number;
  lastFocus: MapFocusPayload | null;
  requestMapFocus: (p: MapFocusPayload) => void;
};

const MapFocusContext = createContext<MapFocusContextValue | null>(null);

export function MapFocusProvider({ children }: { children: ReactNode }) {
  const [focusGeneration, setFocusGeneration] = useState(0);
  const [lastFocus, setLastFocus] = useState<MapFocusPayload | null>(null);

  const requestMapFocus = useCallback((p: MapFocusPayload) => {
    setLastFocus(p);
    setFocusGeneration((g) => g + 1);
  }, []);

  const value = useMemo(
    () => ({ focusGeneration, lastFocus, requestMapFocus }),
    [focusGeneration, lastFocus, requestMapFocus],
  );

  return <MapFocusContext.Provider value={value}>{children}</MapFocusContext.Provider>;
}

export function useMapFocus(): MapFocusContextValue {
  const ctx = useContext(MapFocusContext);
  if (!ctx) {
    throw new Error('useMapFocus must be used within MapFocusProvider');
  }
  return ctx;
}
