import { GEOAPIFY_API_KEY } from "@/config/maps";

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][]; // [lat, lng]
}

export type RouteProfile = "driving" | "cycling" | "walking";

const inFlight = new Map<string, AbortController>();

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cálculo de rota via OSRM (open source) com fallback Geoapify Routing e haversine. */
export async function calculateRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  profile: RouteProfile = "driving"
): Promise<RouteResult | null> {
  const key = `${origin.lat},${origin.lng}->${destination.lat},${destination.lng}:${profile}`;
  inFlight.get(key)?.abort();
  const ctrl = new AbortController();
  inFlight.set(key, ctrl);
  const timer = setTimeout(() => ctrl.abort(), 10000);

  console.log("[Routing:calculate]", { origin, destination, profile });

  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctrl.signal });
    const json = await res.json();
    const route = json?.routes?.[0];
    if (route) {
      return {
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        geometry: (route.geometry?.coordinates ?? []).map((c: [number, number]) => [c[1], c[0]]),
      };
    }
  } catch (err) {
    console.error("[Routing:calculate] osrm error", err);
  } finally {
    clearTimeout(timer);
    inFlight.delete(key);
  }

  if (GEOAPIFY_API_KEY) {
    try {
      const mode = profile === "driving" ? "drive" : profile === "cycling" ? "bicycle" : "walk";
      const res = await fetch(
        `https://api.geoapify.com/v1/routing?waypoints=${origin.lat},${origin.lng}|${destination.lat},${destination.lng}&mode=${mode}&apiKey=${GEOAPIFY_API_KEY}`
      );
      const json = await res.json();
      const f = json?.features?.[0];
      if (f) {
        const coords: [number, number][] = (f.geometry?.coordinates?.flat(1) ?? []).map(
          (c: [number, number]) => [c[1], c[0]]
        );
        return {
          distanceKm: f.properties.distance / 1000,
          durationMin: f.properties.time / 60,
          geometry: coords,
        };
      }
    } catch (err) {
      console.error("[Routing:calculate] geoapify error", err);
    }
  }

  const km = haversineKm(origin, destination);
  return { distanceKm: km, durationMin: (km / 30) * 60, geometry: [[origin.lat, origin.lng], [destination.lat, destination.lng]] };
}
