// gif-service.ts — Klipy GIF search API
// Endpoint: GET https://api.klipy.com/api/v1/{API_KEY}/gifs/search
// Response: { result: true, data: { data: [ { id, slug, title, file: { hd: { gif: { url } }, md: { gif: { url } } } } ] } }

export async function searchGif(query: string, limit = 5): Promise<{ url: string; thumbnailUrl: string; altText: string } | null> {
  const apiKey = process.env.KLIPY_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const res = await fetch(
      `https://api.klipy.com/api/v1/${apiKey}/gifs/search?q=${encodeURIComponent(query)}&per_page=${limit}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const json = await res.json();

    // Klipy response: { result: true, data: { data: [...items] } }
    const items = json?.data?.data || json?.results || [];
    if (!Array.isArray(items) || items.length === 0) return null;

    // Pick random from top results for variety
    const pick = items[Math.floor(Math.random() * Math.min(items.length, 3))];
    if (!pick) return null;

    // Klipy format: pick.file.hd.gif.url / pick.file.md.gif.url / pick.file.sm.gif.url
    const file = pick.file || {};
    const gifUrl = file.hd?.gif?.url || file.md?.gif?.url || file.sm?.gif?.url || '';
    const thumbUrl = file.sm?.gif?.url || file.md?.jpg?.url || file.hd?.jpg?.url || gifUrl;

    if (!gifUrl) return null;

    return {
      url: gifUrl,
      thumbnailUrl: thumbUrl,
      altText: pick.title || pick.slug || query,
    };
  } catch {
    return null; // Timeout or network error — fall back to text-only
  }
}
