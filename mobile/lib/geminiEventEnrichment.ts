import type { EventDetail } from '@/lib/firestoreFeed';
import { getGeminiApiKey, getGeminiModel } from '@/lib/geminiEnv';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiEventEnrichmentResult = {
  summary: string;
  imageUrls: string[];
  sources: { title: string; url: string }[];
  webSearchQueries?: string[];
};

type CacheEntry = { result: GeminiEventEnrichmentResult; expires: number };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 60 * 60 * 1000;

function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model did not return JSON');
  }
  return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
}

function isHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string' || !isHttpsUrl(x)) continue;
    if (out.includes(x)) continue;
    out.push(x);
    if (out.length >= 6) break;
  }
  return out;
}

function normalizeSources(raw: unknown): { title: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { title: string; url: string }[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url : '';
    const title = typeof o.title === 'string' ? o.title : 'Source';
    if (!isHttpsUrl(url)) continue;
    if (out.some((s) => s.url === url)) continue;
    out.push({ title: title.slice(0, 200), url });
    if (out.length >= 8) break;
  }
  return out;
}

function mergeGroundingSources(
  base: { title: string; url: string }[],
  grounding: unknown,
): { title: string; url: string }[] {
  const chunks = (grounding as { groundingChunks?: unknown })?.groundingChunks;
  if (!Array.isArray(chunks)) return base;
  const seen = new Set(base.map((s) => s.url));
  const merged = [...base];
  for (const ch of chunks) {
    if (!ch || typeof ch !== 'object') continue;
    const web = (ch as { web?: { uri?: string; title?: string } }).web;
    const uri = web?.uri;
    const title = web?.title ?? 'Web';
    if (typeof uri !== 'string' || !isHttpsUrl(uri) || seen.has(uri)) continue;
    seen.add(uri);
    merged.push({ title: String(title).slice(0, 200), url: uri });
  }
  return merged.slice(0, 10);
}

type GenerateBody = {
  contents: { role?: string; parts: { text: string }[] }[];
  tools?: { google_search: Record<string, never> }[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
  };
};

type GenerateResponse = {
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  error?: { message?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: unknown;
    };
  }[];
};

async function callGenerateContent(apiKey: string, body: GenerateBody): Promise<GenerateResponse> {
  const model = getGeminiModel();
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GenerateResponse & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Gemini HTTP ${res.status}`);
  }
  return json;
}

function buildPrompt(ev: EventDetail): string {
  const payload = {
    eventId: ev.id,
    title: ev.title,
    description: ev.description ?? null,
    category: ev.category ?? null,
    source: ev.source ?? null,
    listingUrl: ev.link ?? null,
    approximateLocation: { lat: ev.lat, lng: ev.lng },
    startTimeLocal:
      ev.startTimeMs > 0 ? new Date(ev.startTimeMs).toISOString() : null,
    organizerName: ev.organizerName ?? null,
  };
  return `You help CityPulse users who may open this listing from the MAP or from the FEED. Enrich ONE real-world event using Google Search.

Event (JSON — must match this exact event, not a different one):
${JSON.stringify(payload, null, 2)}

Steps:
1) Search the web for this same event (title + venue/area + date if known from the fields above).
2) Write "summary": 2–5 sentences for a general reader — what it is, when/where if found online, who hosts it. If almost nothing is found, say that clearly and still mention what the app already knows from the JSON.
3) "imageUrls": up to 4 direct https URLs to images that clearly belong to THIS event (poster, flyer, official hero image). Empty array if unsure.
4) "sources": 1–6 https URLs you relied on (event page, venue, ticketing, reputable news).

Output ONLY valid JSON (no markdown):
{"summary":"...","imageUrls":[],"sources":[{"title":"...","url":"https://..."}]}`;
}

function buildFallbackPrompt(ev: EventDetail): string {
  const parts = [
    `Title: ${ev.title}`,
    ev.description ? `Description from app: ${ev.description}` : null,
    ev.link ? `Official or listing URL: ${ev.link}` : null,
    `Approximate coordinates: ${ev.lat}, ${ev.lng}`,
    ev.startTimeMs > 0 ? `Start (ISO): ${new Date(ev.startTimeMs).toISOString()}` : null,
  ].filter(Boolean);
  return `${parts.join('\n')}

Return ONLY valid JSON:
{"summary":"2-4 sentences about this event using the info above and general knowledge. If the web search tool is unavailable, be honest about uncertainty.","imageUrls":[],"sources":[]}`;
}

function resultFromParsed(
  parsed: unknown,
  grounding: unknown,
  webSearchQueries: string[] | undefined,
): GeminiEventEnrichmentResult {
  const o = parsed as Record<string, unknown>;
  const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
  const imageUrls = normalizeImageUrls(o.imageUrls);
  let sources = normalizeSources(o.sources);
  sources = mergeGroundingSources(sources, grounding);
  return {
    summary: summary.slice(0, 4000) || 'No additional summary available.',
    imageUrls,
    sources,
    webSearchQueries,
  };
}

function extractText(c: GenerateResponse['candidates']): string {
  const parts = c?.[0]?.content?.parts;
  if (!parts?.length) return '';
  return parts.map((p) => p.text ?? '').join('');
}

/**
 * Web-grounded details for a Firestore event (map pin or feed card). Cached 1h per event id.
 */
export async function enrichMapEventWithGemini(ev: EventDetail): Promise<GeminiEventEnrichmentResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in mobile/.env (restart Expo after saving)');
  }

  const now = Date.now();
  const cached = cache.get(ev.id);
  if (cached && cached.expires > now) {
    return cached.result;
  }

  const finish = async (json: GenerateResponse): Promise<GeminiEventEnrichmentResult> => {
    const pf = json.promptFeedback;
    if (pf?.blockReason) {
      throw new Error(pf.blockReasonMessage ?? `Request blocked (${pf.blockReason})`);
    }
    const cand = json.candidates?.[0];
    const text = extractText(json.candidates);
    const gm = cand?.groundingMetadata;
    const webSearchQueries = gm?.webSearchQueries;

    let parsed: unknown;
    try {
      parsed = parseJsonFromModelText(text);
    } catch {
      const t = text.trim();
      const result: GeminiEventEnrichmentResult = {
        summary:
          t.slice(0, 2000) ||
          'The model did not return parseable JSON. Set GEMINI_MODEL in mobile/.env or check GEMINI_API_KEY.',
        imageUrls: [],
        sources: mergeGroundingSources([], gm),
        webSearchQueries,
      };
      cache.set(ev.id, { result, expires: now + CACHE_MS });
      return result;
    }

    const result = resultFromParsed(parsed, gm, webSearchQueries);
    cache.set(ev.id, { result, expires: now + CACHE_MS });
    return result;
  };

  try {
    const json = await callGenerateContent(apiKey, {
      contents: [{ parts: [{ text: buildPrompt(ev) }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 4096,
      },
    });
    const text = extractText(json.candidates);
    if (!text.trim()) {
      throw new Error('Empty response from Gemini with search');
    }
    return await finish(json);
  } catch (firstErr) {
    try {
      const json = await callGenerateContent(apiKey, {
        contents: [{ parts: [{ text: buildFallbackPrompt(ev) }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      });
      if (!extractText(json.candidates).trim()) throw new Error('Empty fallback (search)');
      return await finish(json);
    } catch {
      /* fall through */
    }
    try {
      const json = await callGenerateContent(apiKey, {
        contents: [{ parts: [{ text: buildFallbackPrompt(ev) }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      });
      if (!extractText(json.candidates).trim()) throw new Error('Empty fallback (no tools)');
      return await finish(json);
    } catch (e) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(
        e instanceof Error
          ? `${msg} · Fallback failed: ${e.message}`
          : msg,
      );
    }
  }
}
