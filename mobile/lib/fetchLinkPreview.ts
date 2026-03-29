/** Rich preview from a public URL (Open Graph via Microlink; no API key for basic use). */
export type LinkPreview = {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

type MicrolinkImage = { url?: string };
type MicrolinkData = {
  title?: string;
  description?: string;
  image?: MicrolinkImage;
  logo?: MicrolinkImage;
};

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const u = url.trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  try {
    const api = `https://api.microlink.io?url=${encodeURIComponent(u)}`;
    const res = await fetch(api);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: MicrolinkData };
    const data = json.data;
    if (!data) return null;
    const imageUrl =
      (typeof data.image?.url === 'string' && data.image.url) ||
      (typeof data.logo?.url === 'string' && data.logo.url) ||
      undefined;
    return {
      url: u,
      title: typeof data.title === 'string' ? data.title : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      imageUrl,
    };
  } catch {
    return null;
  }
}
