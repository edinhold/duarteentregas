import { useEffect, useRef } from "react";
import { Restaurant } from "@/types";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_LAYERS } from "@/config/maps";
import { useNavigate } from "react-router-dom";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const openIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const closedIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23999" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const driverMapIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="%233b82f6" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 6v6l3 3" stroke="white" stroke-width="2" fill="none"/></svg>`
  ),
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

interface RestaurantMapProps {
  restaurants: Restaurant[];
}

const RestaurantMap = ({ restaurants }: RestaurantMapProps) => {
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: driverLocations = [] } = useDriverLocations();

  const markers = restaurants.filter((r) => r.latitude && r.longitude);
  const center: [number, number] = markers.length > 0
    ? [markers[0].latitude!, markers[0].longitude!]
    : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(center, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer(MAP_LAYERS.streets.url, {
      attribution: MAP_LAYERS.streets.attribution,
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle) map.removeLayer(layer);
    });

    // Restaurant markers
    markers.forEach((r) => {
      const marker = L.marker([r.latitude!, r.longitude!], {
        icon: r.is_open ? openIcon : closedIcon,
      }).addTo(map);

      marker.bindPopup(`
        <div style="min-width:160px">
          <h3 style="font-weight:bold;font-size:14px;margin:0">${r.name}</h3>
          <p style="font-size:12px;color:#666;margin:2px 0">${r.category_name}</p>
          <div style="display:flex;gap:8px;font-size:11px;color:#888;margin-top:4px">
            <span>⭐ ${r.rating}</span>
            <span>🕐 ${r.delivery_time}</span>
          </div>
          <p style="font-size:11px;color:${r.is_open ? '#e53935' : '#999'};font-weight:600;margin-top:4px">
            ${r.is_open ? 'Aberto' : 'Fechado'}
          </p>
        </div>
      `);

      marker.on("click", () => navigate(`/restaurant/${r.id}`));
    });

    // Driver markers
    driverLocations.forEach((d: any) => {
      const dMarker = L.marker([d.latitude, d.longitude], {
        icon: driverMapIcon,
      }).addTo(map);

      const speedKmh = d.speed ? Math.round(d.speed * 3.6) : 0;
      const accText = d.accuracy ? `±${Math.round(d.accuracy)}m` : "";

      dMarker.bindPopup(`
        <div style="min-width:120px">
          <h3 style="font-weight:bold;font-size:13px;margin:0">🚴 Entregador</h3>
          ${speedKmh > 0 ? `<p style="font-size:11px;color:#666;margin:2px 0">🚗 ${speedKmh} km/h</p>` : ""}
          ${accText ? `<p style="font-size:11px;color:#888;margin:2px 0">🎯 ${accText}</p>` : ""}
          <p style="font-size:10px;color:#3b82f6;font-weight:600;margin-top:4px">Em atividade</p>
        </div>
      `);

      // Accuracy circle
      if (d.accuracy && d.accuracy > 0) {
        L.circle([d.latitude, d.longitude], {
          radius: d.accuracy,
          fillColor: "#3b82f6",
          fillOpacity: 0.05,
          color: "#3b82f6",
          opacity: 0.15,
          weight: 1,
        }).addTo(map);
      }
    });
  }, [markers, navigate, driverLocations]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};

export default RestaurantMap;
