import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Navigation, MapPin, Locate, ExternalLink, Loader2, Signal, SignalZero } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER } from "@/config/maps";

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

const driverIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%233b82f6" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`
  ),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface DriverGPSProps {
  activeRequest?: any;
  pendingRequests?: any[];
  onAcceptRequest?: (id: string) => void;
}

// Helper to recenter map
const RecenterMap = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center[0], center[1]]);
  return null;
};

const DriverGPS = ({ activeRequest, pendingRequests = [], onAcceptRequest }: DriverGPSProps) => {
  const [driverPosition, setDriverPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);
  const [watching, setWatching] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("GPS não suportado neste dispositivo");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy);
        setWatching(true);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Permissão de localização negada.");
        } else {
          toast.error("Erro ao obter localização");
        }
        setWatching(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    setWatchId(id);
  }, []);

  const stopTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setWatching(false);
    }
  }, [watchId]);

  useEffect(() => {
    startTracking();
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, []);

  const openNavigation = (address: string, app: "google" | "waze") => {
    if (app === "waze") {
      window.open(`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`, "_blank");
    } else {
      const prefix = driverPosition ? `${driverPosition.lat},${driverPosition.lng}/` : "";
      window.open(`https://www.google.com/maps/dir/${prefix}${encodeURIComponent(address)}`, "_blank");
    }
  };

  const currentDestination = activeRequest
    ? activeRequest.status === "accepted" ? activeRequest.pickup_address : activeRequest.delivery_address
    : null;

  const currentDestinationLabel = activeRequest
    ? activeRequest.status === "accepted" ? "📦 Coleta" : "🏠 Entrega"
    : null;

  const requestMarkers = pendingRequests
    .filter((r: any) => r.restaurants?.latitude && r.restaurants?.longitude)
    .map((r: any) => ({ id: r.id, lat: r.restaurants.latitude, lng: r.restaurants.longitude, name: r.restaurants.name }));

  const mapCenter: [number, number] = driverPosition
    ? [driverPosition.lat, driverPosition.lng]
    : requestMarkers[0]
      ? [requestMarkers[0].lat, requestMarkers[0].lng]
      : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

  return (
    <div className="space-y-4">
      {/* GPS Status Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Navigation className="w-4 h-4" /> GPS em Tempo Real
            {watching ? (
              <Badge variant="default" className="ml-auto gap-1 text-xs"><Signal className="w-3 h-3" /> Ativo</Badge>
            ) : (
              <Badge variant="destructive" className="ml-auto gap-1 text-xs"><SignalZero className="w-3 h-3" /> Inativo</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {driverPosition ? (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">📍 Sua posição</span>
                <span className="font-mono text-xs">{driverPosition.lat.toFixed(5)}, {driverPosition.lng.toFixed(5)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">🎯 Precisão</span>
                <span className={`font-bold ${accuracy <= 20 ? "text-green-600" : accuracy <= 50 ? "text-yellow-600" : "text-red-500"}`}>±{Math.round(accuracy)}m</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Obtendo localização...</span>
            </div>
          )}
          <div className="flex gap-2">
            {!watching ? (
              <Button onClick={startTracking} size="sm" className="flex-1"><Locate className="w-4 h-4 mr-1" /> Ativar GPS</Button>
            ) : (
              <Button onClick={stopTracking} size="sm" variant="outline" className="flex-1">Pausar GPS</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Navigation for Active Request */}
      {activeRequest && currentDestination && (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> {currentDestinationLabel} — Navegar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{currentDestination}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => openNavigation(currentDestination, "google")} variant="outline" size="sm" className="gap-1">
                <ExternalLink className="w-3 h-3" /> Google Maps
              </Button>
              <Button onClick={() => openNavigation(currentDestination, "waze")} variant="outline" size="sm" className="gap-1">
                <ExternalLink className="w-3 h-3" /> Waze
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Map */}
      {(driverPosition || requestMarkers.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mapa ao Vivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 rounded-lg overflow-hidden">
              <MapContainer center={mapCenter} zoom={14} style={{ width: "100%", height: "100%" }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <RecenterMap center={mapCenter} />
                {driverPosition && (
                  <>
                    <Marker position={[driverPosition.lat, driverPosition.lng]} icon={driverIcon}>
                      <Popup>Você está aqui</Popup>
                    </Marker>
                    <Circle center={[driverPosition.lat, driverPosition.lng]} radius={accuracy} pathOptions={{ fillColor: "#3b82f6", fillOpacity: 0.1, color: "#3b82f6", opacity: 0.3 }} />
                  </>
                )}
                {requestMarkers.map((m) => (
                  <Marker key={m.id} position={[m.lat, m.lng]} eventHandlers={{ click: () => onAcceptRequest?.(m.id) }}>
                    <Popup>{m.name}</Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DriverGPS;
