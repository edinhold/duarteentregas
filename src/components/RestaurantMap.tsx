import { useState, useEffect } from "react";
import { Restaurant } from "@/types";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "@/config/maps";
import { useNavigate } from "react-router-dom";
import L from "leaflet";

// Fix default marker icon
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface RestaurantMapProps {
  restaurants: Restaurant[];
}

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

const RestaurantMap = ({ restaurants }: RestaurantMapProps) => {
  const navigate = useNavigate();
  const [mapReady, setMapReady] = useState(false);
  const [MapComponents, setMapComponents] = useState<any>(null);

  // Lazy load react-leaflet to avoid SSR/initialization issues
  useEffect(() => {
    console.log("[RestaurantMap] Loading react-leaflet...");
    import("react-leaflet").then((mod) => {
      console.log("[RestaurantMap] react-leaflet loaded successfully");
      setMapComponents({
        MapContainer: mod.MapContainer,
        TileLayer: mod.TileLayer,
        Marker: mod.Marker,
        Popup: mod.Popup,
      });
      setMapReady(true);
    }).catch((err) => {
      console.error("[RestaurantMap] Failed to load react-leaflet:", err);
    });
  }, []);

  const markers = restaurants.filter((r) => r.latitude && r.longitude);
  const center: [number, number] = markers.length > 0
    ? [markers[0].latitude!, markers[0].longitude!]
    : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

  if (!mapReady || !MapComponents) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-2xl">
        <p className="text-sm text-muted-foreground">Carregando mapa...</p>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = MapComponents;

  return (
    <MapContainer center={center} zoom={DEFAULT_ZOOM} style={{ width: "100%", height: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((r: Restaurant) => (
        <Marker
          key={r.id}
          position={[r.latitude!, r.longitude!]}
          icon={r.is_open ? openIcon : closedIcon}
          eventHandlers={{ click: () => navigate(`/restaurant/${r.id}`) }}
        >
          <Popup>
            <div className="min-w-[160px]">
              <h3 style={{ fontWeight: "bold", fontSize: 14, margin: 0 }}>{r.name}</h3>
              <p style={{ fontSize: 12, color: "#666", margin: "2px 0" }}>{r.category_name}</p>
              <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#888", marginTop: 4 }}>
                <span>⭐ {r.rating}</span>
                <span>🕐 {r.delivery_time}</span>
              </div>
              <p style={{ fontSize: 11, color: r.is_open ? "#e53935" : "#999", fontWeight: 600, marginTop: 4 }}>
                {r.is_open ? "Aberto" : "Fechado"}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default RestaurantMap;
