import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
const { LngLatBounds } = maplibregl;
import "maplibre-gl/dist/maplibre-gl.css";
import { MAPLIBRE_OSM_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from "@/config/maps";
import { searchAddress, reverseGeocode, geocodeToCoords } from "./geocoding";
import { calculateRoute } from "./routing";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MarkerOptions {
  color?: string;
  draggable?: boolean;
  popupHtml?: string;
  onClick?: () => void;
  onDragEnd?: (pos: LatLng) => void;
}

export interface MapInitOptions {
  container: HTMLElement;
  center?: LatLng;
  zoom?: number;
  navigationControl?: boolean;
  fullscreenControl?: boolean;
  geolocateControl?: boolean;
}

/** Interface única de mapas consumida por toda a aplicação. */
export interface MapProvider {
  initializeMap(options: MapInitOptions): MLMap;
  searchAddress: typeof searchAddress;
  reverseGeocode: typeof reverseGeocode;
  geocodeToCoords: typeof geocodeToCoords;
  calculateRoute: typeof calculateRoute;
  createMarker(map: MLMap, position: LatLng, options?: MarkerOptions): MLMarker;
  fitBounds(map: MLMap, positions: LatLng[], padding?: number): void;
  destroy(map: MLMap | null): void;
}

export const mapLibreProvider: MapProvider = {
  initializeMap({ container, center, zoom, navigationControl = true, fullscreenControl = true, geolocateControl = true }) {
    const c = center ?? DEFAULT_CENTER;
    console.log("[MapProvider:init]", { center: c, zoom: zoom ?? DEFAULT_ZOOM });

    const map = new maplibregl.Map({
      container,
      style: MAPLIBRE_OSM_STYLE as any,
      center: [c.lng, c.lat],
      zoom: zoom ?? DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    if (navigationControl) map.addControl(new maplibregl.NavigationControl(), "top-right");
    if (fullscreenControl) map.addControl(new maplibregl.FullscreenControl(), "top-right");
    if (geolocateControl) {
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }),
        "top-right"
      );
    }

    return map;
  },

  searchAddress,
  reverseGeocode,
  geocodeToCoords,
  calculateRoute,

  createMarker(map, position, options = {}) {
    console.log("[Map:marker]", { position, draggable: !!options.draggable });
    const marker = new maplibregl.Marker({
      color: options.color ?? "#2563eb",
      draggable: !!options.draggable,
    })
      .setLngLat([position.lng, position.lat])
      .addTo(map);

    if (options.popupHtml) {
      marker.setPopup(new maplibregl.Popup({ offset: 24 }).setHTML(options.popupHtml));
    }
    if (options.onClick) {
      marker.getElement().addEventListener("click", options.onClick);
    }
    if (options.onDragEnd) {
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        options.onDragEnd?.({ lat, lng });
      });
    }
    return marker;
  },

  fitBounds(map, positions, padding = 48) {
    if (positions.length === 0) return;
    const bounds = new LngLatBounds();
    positions.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding, maxZoom: 17 });
  },

  destroy(map) {
    if (map) map.remove();
  },
};

export default mapLibreProvider;
