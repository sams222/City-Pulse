/**
 * Turns Firestore/API snake_case labels (e.g. `suspicious_activity`) into readable titles.
 * Strings without underscores are returned unchanged.
 */
export function formatDisplayTitle(raw: string | undefined | null): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (!s.includes('_')) return s;
  return s
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
