import { GoogleMap, MarkerF, InfoWindowF } from "@react-google-maps/api";
import { useState } from "react";
import { Restaurant } from "@/types";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "@/config/maps";
import { Star, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface RestaurantMapProps {
  restaurants: Restaurant[];
}

const containerStyle = { width: "100%", height: "100%" };

const RestaurantMap = ({ restaurants }: RestaurantMapProps) => {
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const navigate = useNavigate();

  const markers = restaurants.filter((r) => r.latitude && r.longitude);

  const center = markers.length > 0
    ? { lat: markers[0].latitude!, lng: markers[0].longitude! }
    : DEFAULT_CENTER;

  return (
    <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={DEFAULT_ZOOM}>
      {markers.map((r) => (
        <MarkerF
          key={r.id}
          position={{ lat: r.latitude!, lng: r.longitude! }}
          onClick={() => setSelected(r)}
          icon={{
            url: "data:image/svg+xml," + encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${r.is_open ? '%23e53935' : '%23999'}" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
            ),
            scaledSize: new google.maps.Size(36, 36),
          }}
        />
      ))}
      {selected && (
        <InfoWindowF
          position={{ lat: selected.latitude!, lng: selected.longitude! }}
          onCloseClick={() => setSelected(null)}
        >
          <div
            className="cursor-pointer p-1 min-w-[160px]"
            onClick={() => navigate(`/restaurant/${selected.id}`)}
          >
            <h3 style={{ fontWeight: "bold", fontSize: 14, margin: 0 }}>{selected.name}</h3>
            <p style={{ fontSize: 12, color: "#666", margin: "2px 0" }}>{selected.category_name}</p>
            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#888", marginTop: 4 }}>
              <span>⭐ {selected.rating}</span>
              <span>🕐 {selected.delivery_time}</span>
            </div>
            <p style={{ fontSize: 11, color: "#e53935", fontWeight: 600, marginTop: 4 }}>
              {selected.is_open ? "Aberto" : "Fechado"}
            </p>
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  );
};

export default RestaurantMap;
