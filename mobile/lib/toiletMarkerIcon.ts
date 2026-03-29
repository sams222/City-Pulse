/**
 * Minimal toilet bowl + tank graphic (high contrast on map).
 * `accent` = pin border / tank outline color (e.g. restroom blue).
 */
export function toiletMarkerSvgDataUrl(accent: string, size = 36): string {
  const s = escapeXml(accent);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36">
  <circle cx="18" cy="18" r="16" fill="#0f172a" stroke="${s}" stroke-width="2"/>
  <!-- tank -->
  <rect x="11" y="9" width="14" height="8" rx="1.5" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8"/>
  <!-- bowl -->
  <ellipse cx="18" cy="23" rx="9" ry="5" fill="#cbd5e1" stroke="#64748b" stroke-width="0.9"/>
  <ellipse cx="18" cy="23" rx="5" ry="2.5" fill="#0f172a" opacity="0.35"/>
  <!-- seat line -->
  <path d="M9 22h18" stroke="#64748b" stroke-width="0.8" fill="none"/>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(c: string): string {
  return c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
