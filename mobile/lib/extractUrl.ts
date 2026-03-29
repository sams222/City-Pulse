/** First http(s) URL in a string (e.g. source line with a link). */
export function extractFirstUrl(text: string | undefined | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0].replace(/[),.;]+$/, '') : null;
}
