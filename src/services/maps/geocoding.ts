import { GEOAPIFY_API_KEY } from "@/config/maps";

export interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: any;
}

const cache = new Map<string, { at: number; data: any }>();
const TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  if (hit) cache.delete(key);
  return null;
}

function setCached(key: string, data: any) {
  cache.set(key, { at: Date.now(), data });
}

async function fetchJson(url: string, timeoutMs = 8000, retries = 1): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "Accept-Language": "pt-BR" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Busca de endereço (autocomplete). Geoapify quando houver chave, senão Nominatim/OSM. */
export async function searchAddress(
  query: string,
  opts: { lat?: number; lng?: number; limit?: number } = {}
): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = `s:${q}:${opts.lat ?? ""}:${opts.lng ?? ""}`;
  const cached = getCached<GeoResult[]>(key);
  if (cached) return cached;

  console.log("[Geocoding:search]", { query: q, ...opts });
  const limit = opts.limit ?? 5;
  let results: GeoResult[] = [];

  try {
    if (GEOAPIFY_API_KEY) {
      let url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
        q
      )}&filter=countrycode:br&lang=pt&limit=${limit}&apiKey=${GEOAPIFY_API_KEY}`;
      if (opts.lat && opts.lng) url += `&bias=proximity:${opts.lng},${opts.lat}`;
      const data = await fetchJson(url);
      results = (data?.features ?? []).map((f: any) => ({
        display_name: f.properties.formatted,
        lat: String(f.properties.lat),
        lon: String(f.properties.lon),
        address: {
          road: f.properties.street,
          house_number: f.properties.housenumber,
          suburb: f.properties.suburb || f.properties.district,
          city: f.properties.city,
          state: f.properties.state,
        },
      }));
    }
  } catch (err) {
    console.error("[Geocoding:search] geoapify error", err);
  }

  if (results.length === 0) {
    const hasCity = /primavera do leste|\bmt\b|mato grosso/i.test(q);
    const text = hasCity ? q : `${q}, Primavera do Leste, MT`;
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      text
    )}&format=json&limit=${limit}&countrycodes=br&addressdetails=1&accept-language=pt-BR`;
    if (opts.lat && opts.lng) {
      const d = 0.25;
      url += `&viewbox=${opts.lng - d},${opts.lat - d},${opts.lng + d},${opts.lat + d}&bounded=1`;
    }
    try {
      const data = await fetchJson(url);
      results = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("[Geocoding:search] nominatim error", err);
      results = [];
    }
  }

  setCached(key, results);
  return results;
}

/** Reverse geocoding: coordenadas -> endereço estruturado. */
export async function reverseGeocode(lat: number, lng: number): Promise<any | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `r:${lat.toFixed(6)},${lng.toFixed(6)}`;
  const cached = getCached<any>(key);
  if (cached) return cached;

  console.log("[Geocoding:reverse]", { lat, lng });
  try {
    if (GEOAPIFY_API_KEY) {
      const data = await fetchJson(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&lang=pt&apiKey=${GEOAPIFY_API_KEY}`
      );
      const p = data?.features?.[0]?.properties;
      if (p) {
        const out = {
          display_name: p.formatted,
          address: {
            road: p.street,
            house_number: p.housenumber,
            suburb: p.suburb || p.district,
            city: p.city,
            state: p.state,
          },
        };
        setCached(key, out);
        return out;
      }
    }
    const data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`
    );
    if (data) setCached(key, data);
    return data ?? null;
  } catch (err) {
    console.error("[Geocoding:reverse] error", err);
    return null;
  }
}

/** Retorna somente as coordenadas do melhor resultado. */
export async function geocodeToCoords(address: string): Promise<{ lat: number; lng: number } | null> {
  const [first] = await searchAddress(address, { limit: 1 });
  if (!first) return null;
  return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
}
