// gif-service.ts — Klipy GIF search API (Tenor-compatible, free tier)
// Endpoint: GET https://api.klipy.com/api/v1/{API_KEY}/gifs/search

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

    const data = await res.json();
    const results = data?.results || data?.data || [];
    if (results.length === 0) return null;

    // Pick random from top results for variety
    const pick = results[Math.floor(Math.random() * Math.min(results.length, 3))];

    // Klipy/Tenor format: media array with gif and tinygif
    const gifMedia = pick?.media_formats?.gif || pick?.media?.[0]?.gif;
    const tinyMedia = pick?.media_formats?.tinygif || pick?.media?.[0]?.tinygif;

    return {
      url: gifMedia?.url || pick.url || pick.itemurl || '',
      thumbnailUrl: tinyMedia?.url || gifMedia?.url || pick.url || '',
      altText: pick.title || pick.content_description || query,
    };
  } catch {
    return null; // Timeout or network error -- fall back to text-only
  }
}
