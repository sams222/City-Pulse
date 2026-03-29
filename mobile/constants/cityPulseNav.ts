/** Visual tokens shared by the City Pulse floating tab bar (original frontend design). */

export const CITY_PULSE_PRIMARY = '#10B981';
export const CITY_PULSE_MUTED = '#71717A';

export const TAB_PILL_BOTTOM = 16;
export const TAB_BAR_INNER_HEIGHT = 56;

/** Extra space content should reserve so it clears the floating pill + safe area. */
export function floatingTabBarExtraBottom(safeBottom: number): number {
  return Math.max(safeBottom, 8) + TAB_PILL_BOTTOM + TAB_BAR_INNER_HEIGHT + 8;
}

export type CityPulseTabRoute = 'index' | 'feed' | 'quests' | 'profile';

export type NavItemDef = {
  routeName: CityPulseTabRoute;
  label: string;
};

export const CITY_PULSE_TAB_NAV: NavItemDef[] = [
  { routeName: 'index', label: 'Map' },
  { routeName: 'feed', label: 'Feed' },
  { routeName: 'quests', label: 'Quests' },
  { routeName: 'profile', label: 'Profile' },
];
