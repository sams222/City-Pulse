import Constants from 'expo-constants';

type Extra = {
  geminiApiKey?: string;
  geminiModel?: string;
};

function getExpoExtra(): Extra {
  const fromExpo = Constants.expoConfig?.extra as Extra | undefined;
  if (fromExpo && typeof fromExpo === 'object') return fromExpo;
  const legacy = Constants.manifest as { extra?: Extra } | null;
  if (legacy?.extra && typeof legacy.extra === 'object') return legacy.extra;
  return {};
}

/**
 * Gemini API key: **GEMINI_API_KEY** in `mobile/.env` → `app.config.js` → `expo.extra.geminiApiKey`.
 * Falls back to EXPO_PUBLIC_GEMINI_API_KEY only if inlined by Metro.
 * @see https://ai.google.dev/gemini-api/docs/api-key
 */
export function getGeminiApiKey(): string | null {
  const fromExtra = (getExpoExtra().geminiApiKey ?? '').trim();
  const fromPublic = (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim();
  const k = fromExtra || fromPublic;
  return k.length > 0 ? k : null;
}

export function getGeminiModel(): string {
  const fromExtra = (getExpoExtra().geminiModel ?? '').trim();
  const fromPublic = (process.env.EXPO_PUBLIC_GEMINI_MODEL ?? '').trim();
  return fromExtra || fromPublic || 'gemini-2.5-flash';
}
