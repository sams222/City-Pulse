import type { MapMarkerLayer } from '@/components/map/mapTypes';

export const PIN_EVENT_GREEN = '#22c55e';
export const PIN_INCIDENT_RED = '#ef4444';
export const PIN_BATHROOM_BLUE = '#0ea5e9';
export const PIN_QUEST_AMBER = '#FFB800';

export const LAYER_VISUAL: Record<
  MapMarkerLayer,
  { color: string; icon: 'calendar' | 'warning' | 'water' | 'flag'; label: string }
> = {
  events: { color: PIN_EVENT_GREEN, icon: 'calendar', label: 'Events' },
  incidents: { color: PIN_INCIDENT_RED, icon: 'warning', label: 'Safety' },
  bathrooms: { color: PIN_BATHROOM_BLUE, icon: 'water', label: 'Restrooms' },
  quests: { color: PIN_QUEST_AMBER, icon: 'flag', label: 'Quests' },
};

export const ALL_MAP_LAYERS: MapMarkerLayer[] = ['events', 'incidents', 'bathrooms', 'quests'];

export function defaultLayerVisibility(): Record<MapMarkerLayer, boolean> {
  return {
    events: true,
    incidents: true,
    bathrooms: false,
    quests: true,
  };
}
