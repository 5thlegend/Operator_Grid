// Mapbox Geocoding wrapper. Server-only: keep token usage minimal.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export async function geocodeUS(query: string): Promise<{ lat: number; lng: number; place_name: string } | null> {
  if (!TOKEN) return null;
  const q = query.trim();
  if (q.length < 2) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=us&types=place,region&limit=1&access_token=${TOKEN}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) return null;
    const data = await res.json() as { features?: { center: [number, number]; place_name: string }[] };
    const f = data.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.center;
    return { lat, lng, place_name: f.place_name };
  } catch {
    return null;
  }
}
