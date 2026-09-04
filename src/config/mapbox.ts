/**
 * Configuração e Serviços da API Mapbox — Integração Oficial Estável (v6 / v5 / v1)
 *
 * A Mapbox é utilizada EXCLUSIVAMENTE para:
 * - Geocodificação (forward/reverse v6)
 * - Autocomplete e Busca de Endereços (v6)
 * - Cálculo de Rotas / Directions (v5)
 * - Matriz de Distâncias / Matrix (v1)
 */

export const MAPBOX_ACCESS_TOKEN: string =
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ?? "";

export const MAPBOX_TOKEN_MISSING_MESSAGE =
  "O serviço de localização não está configurado.";

export function hasMapboxToken(): boolean {
  return MAPBOX_ACCESS_TOKEN.trim().length > 0;
}

export function assertMapboxToken(): string {
  const token = MAPBOX_ACCESS_TOKEN.trim();
  if (!token) {
    throw new MapboxError("AUTH_FAILURE", "Mapbox access token não configurado");
  }
  if (token.startsWith("sk.")) {
    throw new MapboxError("AUTH_FAILURE", "Mapbox access token inválido: use um token público (pk.)");
  }
  return token;
}

/** Endpoints oficiais das APIs Mapbox */
export const MAPBOX_GEOCODE_FORWARD_URL =
  "https://api.mapbox.com/search/geocode/v6/forward";
export const MAPBOX_GEOCODE_REVERSE_URL =
  "https://api.mapbox.com/search/geocode/v6/reverse";
export const MAPBOX_DIRECTIONS_URL =
  "https://api.mapbox.com/directions/v5/mapbox";
export const MAPBOX_MATRIX_URL =
  "https://api.mapbox.com/directions-matrix/v1/mapbox";

export const MAPBOX_REQUEST_TIMEOUT_MS = 10_000;
export const MAPBOX_PERMANENT_GEOCODING_ENABLED = false;

/** Coordenadas e Bounding Box oficiais para Primavera do Leste / MT */
export const PRIMAVERA_DO_LESTE_CENTER = {
  longitude: -54.3079,
  latitude: -15.5595,
};

// [min_lon, min_lat, max_lon, max_lat]
export const PRIMAVERA_DO_LESTE_BBOX = [-54.50, -15.70, -54.10, -15.40] as const;

export type MapboxErrorType =
  | "ADDRESS_NOT_FOUND"
  | "ADDRESS_OUTSIDE_CITY"
  | "INSUFFICIENT_PRECISION"
  | "AUTH_FAILURE"
  | "RATE_LIMIT"
  | "NETWORK_ERROR"
  | "MAPBOX_API_ERROR"
  | "ROUTE_NOT_FOUND";

export class MapboxError extends Error {
  constructor(
    public readonly type: MapboxErrorType,
    message: string,
    public readonly rawDetails?: any
  ) {
    super(message);
    this.name = "MapboxError";
  }
}

export interface MapboxAddressResult {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  longitude: number;
  latitude: number;
  formattedAddress: string;
  mapboxId: string;
  matchMetadata: {
    confidence?: string;
    matchCode?: any;
    featureType?: string;
  };
}

export interface MapboxRouteResult {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  geometry: [number, number][]; // [[lat, lng], ...] para Leaflet
}

export interface MapboxSuggestion {
  mapboxId: string;
  name: string;
  fullAddress: string;
  placeFormatted: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  postcode: string;
  longitude: number;
  latitude: number;
  confidence?: string;
}

/**
 * Converte a estrutura real da API Mapbox v6 em objeto estruturado.
 */
export function parseMapboxFeature(feature: any): MapboxAddressResult | null {
  if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
    return null;
  }

  // Coordenadas na Mapbox v6: [longitude, latitude]
  const [longitude, latitude] = feature.geometry.coordinates;

  if (typeof longitude !== "number" || typeof latitude !== "number" || isNaN(longitude) || isNaN(latitude)) {
    return null;
  }

  const props = feature.properties || {};
  const context = props.context || {};

  const street =
    context.street?.name ||
    context.address?.street_name ||
    props.name ||
    "";

  const number =
    context.address?.address_number ||
    context.address?.name ||
    "";

  const neighborhood =
    context.neighborhood?.name ||
    context.locality?.name ||
    "";

  const city =
    context.place?.name ||
    context.locality?.name ||
    "Primavera do Leste";

  const state =
    context.region?.region_code ||
    context.region?.name ||
    "MT";

  const postcode = context.postcode?.name || "";

  const country =
    context.country?.name ||
    context.country?.country_code ||
    "Brasil";

  const formattedAddress =
    props.full_address ||
    props.place_formatted ||
    [street, number, neighborhood, city, state].filter(Boolean).join(", ");

  const mapboxId = props.mapbox_id || feature.id || "";

  const matchMetadata = {
    confidence: props.match_code?.confidence || props.confidence || "high",
    matchCode: props.match_code || null,
    featureType: props.feature_type || feature.place_type?.[0] || "",
  };

  return {
    street,
    number,
    neighborhood,
    city,
    state,
    postcode,
    country,
    longitude,
    latitude,
    formattedAddress,
    mapboxId,
    matchMetadata,
  };
}

/**
 * Restringe e valida os resultados exclusivamente para Primavera do Leste / Mato Grosso / Brasil.
 */
export function validatePrimaveraResult(
  result: MapboxAddressResult
): MapboxAddressResult {
  const normCity = (result.city || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normState = (result.state || "").toLowerCase();
  const normCountry = (result.country || "").toLowerCase();
  const normFull = (result.formattedAddress || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isCityValid =
    normCity.includes("primavera") ||
    normFull.includes("primavera do leste") ||
    normFull.includes("primavera do leste, mt");

  const isStateValid =
    normState.includes("mt") ||
    normState.includes("mato grosso") ||
    normFull.includes("mt") ||
    normFull.includes("mato grosso");

  const isCountryValid =
    normCountry.includes("br") ||
    normCountry.includes("brasil") ||
    normCountry.includes("brazil") ||
    normFull.includes("brasil");

  const [minLon, minLat, maxLon, maxLat] = PRIMAVERA_DO_LESTE_BBOX;
  const isWithinBBox =
    result.longitude >= minLon &&
    result.longitude <= maxLon &&
    result.latitude >= minLat &&
    result.latitude <= maxLat;

  if (!isCityValid || !isStateValid || !isCountryValid || !isWithinBBox) {
    console.error("[Mapbox:validar]", {
      reason: "Endereço pertence a outro município ou Estado",
      result,
    });
    throw new MapboxError(
      "ADDRESS_OUTSIDE_CITY",
      "Endereço de outro município. Aceito apenas Primavera do Leste / MT."
    );
  }

  if (result.matchMetadata.confidence === "low") {
    console.error("[Mapbox:validar]", {
      reason: "Resultado sem precisão suficiente",
      result,
    });
    throw new MapboxError(
      "INSUFFICIENT_PRECISION",
      "Resultado da Mapbox sem precisão suficiente para Primavera do Leste."
    );
  }

  return result;
}

/**
 * Geocodificação Forward (Endereço -> Coordenadas) via API Mapbox v6.
 * Utiliza o endereço mais completo disponível:
 * rua + número + bairro + Primavera do Leste + MT + Brasil
 */
export async function mapboxGeocodeForward(options: {
  address: string;
  number?: string;
  neighborhood?: string;
  limit?: number;
}): Promise<MapboxAddressResult> {
  const token = assertMapboxToken();

  let queryText = options.address.trim();

  // Inclui o número se presente e não formatado na busca
  if (options.number && options.number.trim() && !queryText.includes(options.number.trim())) {
    queryText = `${queryText}, ${options.number.trim()}`;
  }

  if (options.neighborhood && options.neighborhood.trim() && !queryText.toLowerCase().includes(options.neighborhood.trim().toLowerCase())) {
    queryText = `${queryText}, ${options.neighborhood.trim()}`;
  }

  const hasCity = /primavera do leste|\bmt\b|mato grosso/i.test(queryText);
  if (!hasCity) {
    queryText = `${queryText}, Primavera do Leste, MT, Brasil`;
  } else if (!/brasil/i.test(queryText)) {
    queryText = `${queryText}, Brasil`;
  }

  const url = new URL(MAPBOX_GEOCODE_FORWARD_URL);
  url.searchParams.set("q", queryText);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "BR");
  url.searchParams.set("language", "pt");
  url.searchParams.set("proximity", `${PRIMAVERA_DO_LESTE_CENTER.longitude},${PRIMAVERA_DO_LESTE_CENTER.latitude}`);
  url.searchParams.set("bbox", PRIMAVERA_DO_LESTE_BBOX.join(","));
  url.searchParams.set("limit", String(options.limit ?? 1));

  console.log("[Mapbox:geocodeForward]", { queryText });

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new MapboxError("AUTH_FAILURE", "Falha de autenticação com a Mapbox");
      }
      if (res.status === 429) {
        throw new MapboxError("RATE_LIMIT", "Limite de requisições excedido na Mapbox");
      }
      throw new MapboxError("MAPBOX_API_ERROR", `Erro na API Mapbox: HTTP ${res.status}`);
    }

    const data = await res.json();
    const features = data.features;
    if (!Array.isArray(features) || features.length === 0) {
      throw new MapboxError("ADDRESS_NOT_FOUND", "Endereço não encontrado");
    }

    const parsed = parseMapboxFeature(features[0]);
    if (!parsed) {
      throw new MapboxError("ADDRESS_NOT_FOUND", "Resposta da Mapbox inválida ou vazia");
    }

    if (options.number && options.number.trim() && !parsed.number) {
      parsed.number = options.number.trim();
    }

    const validated = validatePrimaveraResult(parsed);
    console.log("[Mapbox:geocodeForward:sucesso]", { validated });
    return validated;
  } catch (err: any) {
    if (err instanceof MapboxError) {
      console.error("[Mapbox:geocodeForward:erro]", { type: err.type, message: err.message });
      throw err;
    }
    console.error("[Mapbox:geocodeForward:erro]", { err });
    throw new MapboxError("NETWORK_ERROR", "Erro de rede ao conectar à API Mapbox", err);
  }
}

/**
 * Geocodificação Reverse (Coordenadas -> Endereço) via API Mapbox v6.
 * Coordenadas enviadas à Mapbox: [longitude, latitude]
 */
export async function mapboxGeocodeReverse(options: {
  latitude: number;
  longitude: number;
}): Promise<MapboxAddressResult> {
  const token = assertMapboxToken();

  const url = new URL(MAPBOX_GEOCODE_REVERSE_URL);
  url.searchParams.set("longitude", String(options.longitude));
  url.searchParams.set("latitude", String(options.latitude));
  url.searchParams.set("access_token", token);
  url.searchParams.set("language", "pt");
  url.searchParams.set("types", "address,street,neighborhood,postcode,locality");

  console.log("[Mapbox:geocodeReverse]", { latitude: options.latitude, longitude: options.longitude });

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new MapboxError("AUTH_FAILURE", "Falha de autenticação com a Mapbox");
      }
      if (res.status === 429) {
        throw new MapboxError("RATE_LIMIT", "Limite de requisições excedido na Mapbox");
      }
      throw new MapboxError("MAPBOX_API_ERROR", `Erro na API Mapbox: HTTP ${res.status}`);
    }

    const data = await res.json();
    const features = data.features;
    if (!Array.isArray(features) || features.length === 0) {
      throw new MapboxError("ADDRESS_NOT_FOUND", "Endereço não encontrado para estas coordenadas");
    }

    const parsed = parseMapboxFeature(features[0]);
    if (!parsed) {
      throw new MapboxError("ADDRESS_NOT_FOUND", "Resposta da Mapbox inválida para coordenadas");
    }

    const validated = validatePrimaveraResult(parsed);
    console.log("[Mapbox:geocodeReverse:sucesso]", { validated });
    return validated;
  } catch (err: any) {
    if (err instanceof MapboxError) {
      console.error("[Mapbox:geocodeReverse:erro]", { type: err.type, message: err.message });
      throw err;
    }
    console.error("[Mapbox:geocodeReverse:erro]", { err });
    throw new MapboxError("NETWORK_ERROR", "Erro de rede ao conectar à API Mapbox", err);
  }
}

/**
 * Autocomplete / Busca de Sugestões de Endereço via API Mapbox v6.
 */
export async function mapboxAutocompleteSuggest(options: {
  query: string;
  limit?: number;
}): Promise<MapboxSuggestion[]> {
  if (!options.query || options.query.trim().length < 3) return [];

  const token = assertMapboxToken();

  let searchText = options.query.trim();
  const hasCity = /primavera do leste|\bmt\b|mato grosso/i.test(searchText);
  if (!hasCity) {
    searchText = `${searchText}, Primavera do Leste, MT`;
  }

  const url = new URL(MAPBOX_GEOCODE_FORWARD_URL);
  url.searchParams.set("q", searchText);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "BR");
  url.searchParams.set("language", "pt");
  url.searchParams.set("proximity", `${PRIMAVERA_DO_LESTE_CENTER.longitude},${PRIMAVERA_DO_LESTE_CENTER.latitude}`);
  url.searchParams.set("bbox", PRIMAVERA_DO_LESTE_BBOX.join(","));
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", String(options.limit ?? 5));

  console.log("[Mapbox:autocompleteSuggest]", { searchText });

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data.features)) return [];

    const suggestions: MapboxSuggestion[] = [];

    for (const feature of data.features) {
      const parsed = parseMapboxFeature(feature);
      if (!parsed) continue;

      try {
        validatePrimaveraResult(parsed);
        suggestions.push({
          mapboxId: parsed.mapboxId,
          name: parsed.street ? (parsed.number ? `${parsed.street}, ${parsed.number}` : parsed.street) : parsed.formattedAddress,
          fullAddress: parsed.formattedAddress,
          placeFormatted: parsed.formattedAddress,
          street: parsed.street,
          number: parsed.number,
          neighborhood: parsed.neighborhood,
          city: parsed.city,
          state: parsed.state,
          postcode: parsed.postcode,
          longitude: parsed.longitude,
          latitude: parsed.latitude,
          confidence: parsed.matchMetadata.confidence,
        });
      } catch (e) {
        // Ignora resultados fora de Primavera do Leste
      }
    }

    console.log("[Mapbox:autocompleteSuggest:sucesso]", { count: suggestions.length });
    return suggestions;
  } catch (err) {
    console.error("[Mapbox:autocompleteSuggest:erro]", err);
    return [];
  }
}

/**
 * Cálculo de Rota entre Origem e Destino via Mapbox Directions API v5.
 * Coordenadas enviadas na URL Mapbox: [longitude, latitude]
 * Retorna distância em metros e realiza uma ÚNICA conversão para km:
 * const distanceKm = distanceMeters / 1000;
 */
export async function mapboxGetDirections(options: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  profile?: "driving" | "cycling" | "walking";
}): Promise<MapboxRouteResult> {
  const token = assertMapboxToken();

  const profileMap: Record<string, string> = {
    driving: "driving",
    cycling: "cycling",
    walking: "walking",
  };

  const mapboxProfile = profileMap[options.profile || "driving"] || "driving";

  // Ordem de coordenadas exigida pela Mapbox: longitude,latitude
  const originStr = `${options.origin.longitude},${options.origin.latitude}`;
  const destStr = `${options.destination.longitude},${options.destination.latitude}`;

  const url = `${MAPBOX_DIRECTIONS_URL}/${mapboxProfile}/${originStr};${destStr}?geometries=geojson&overview=full&steps=false&access_token=${token}`;

  console.log("[Mapbox:getDirections]", {
    origin: options.origin,
    destination: options.destination,
    profile: mapboxProfile,
  });

  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new MapboxError("AUTH_FAILURE", "Falha de autenticação com a Mapbox");
      }
      if (res.status === 429) {
        throw new MapboxError("RATE_LIMIT", "Limite de requisições excedido na Mapbox");
      }
      throw new MapboxError("MAPBOX_API_ERROR", `Erro na API Mapbox Directions: HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) {
      throw new MapboxError("ROUTE_NOT_FOUND", "Nenhuma rota encontrada entre a origem e o destino");
    }

    const route = data.routes[0];
    const distanceMeters = Number(route.distance);
    const durationSeconds = Number(route.duration);

    // Conversão ÚNICA de metros para quilômetros
    const distanceKm = distanceMeters / 1000;
    const durationMinutes = durationSeconds / 60;

    // Coordenadas da linha para o Leaflet: [lat, lng]
    const geometry: [number, number][] = (route.geometry?.coordinates || []).map(
      (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
    );

    const result: MapboxRouteResult = {
      distanceMeters,
      distanceKm,
      durationSeconds,
      durationMinutes,
      geometry,
    };

    console.log("[Mapbox:getDirections:sucesso]", {
      distanceMeters,
      distanceKm,
      durationMinutes,
    });

    return result;
  } catch (err: any) {
    if (err instanceof MapboxError) {
      console.error("[Mapbox:getDirections:erro]", { type: err.type, message: err.message });
      throw err;
    }
    console.error("[Mapbox:getDirections:erro]", { err });
    throw new MapboxError("NETWORK_ERROR", "Erro de conexão ao calcular rota na Mapbox", err);
  }
}

/**
 * Cálculo de Matriz de Distâncias entre múltiplos pontos via Mapbox Matrix API v1.
 * Coordenadas enviadas na URL: [longitude, latitude]
 */
export async function mapboxGetMatrix(options: {
  points: { latitude: number; longitude: number }[];
  profile?: "driving" | "cycling" | "walking";
}): Promise<{ distancesMeters: number[][]; durationsSeconds: number[][] }> {
  if (!options.points || options.points.length < 2) {
    return { distancesMeters: [], durationsSeconds: [] };
  }

  const token = assertMapboxToken();
  const profile = options.profile || "driving";
  const coordsStr = options.points
    .map((p) => `${p.longitude},${p.latitude}`)
    .join(";");

  const url = `${MAPBOX_MATRIX_URL}/${profile}/${coordsStr}?annotations=distance,duration&access_token=${token}`;

  console.log("[Mapbox:getMatrix]", { count: options.points.length });

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new MapboxError("MAPBOX_API_ERROR", `Erro na API Mapbox Matrix: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== "Ok") {
      throw new MapboxError("ROUTE_NOT_FOUND", "Erro ao obter matriz de distâncias na Mapbox");
    }

    return {
      distancesMeters: data.distances || [],
      durationsSeconds: data.durations || [],
    };
  } catch (err: any) {
    console.error("[Mapbox:getMatrix:erro]", err);
    throw new MapboxError("NETWORK_ERROR", "Erro de conexão na API Mapbox Matrix", err);
  }
}
