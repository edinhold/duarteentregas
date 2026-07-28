// Stack de mapas 100% open source: MapLibre GL + OpenStreetMap (tiles),
// Geoapify/Nominatim (geocodificação) e OSRM/Geoapify (rotas).
// Nenhuma API do Google é utilizada.
export const DEFAULT_CENTER = { lat: -15.5595, lng: -54.3079 }; // Primavera do Leste, MT center
export const DEFAULT_ZOOM = 14;

export const GEOAPIFY_API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY ?? "";

export const MAP_LAYERS = {
  streets: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri, Maxar, Earthstar Geographics",
  },
  // Camada alternativa (antigo "google") — agora OSM Humanitarian, open source.
  google: {
    url: "https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> / HOT',
  },
};

// Estilo MapLibre baseado em raster tiles do OpenStreetMap (sem chave de API).
export const MAPLIBRE_OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};
