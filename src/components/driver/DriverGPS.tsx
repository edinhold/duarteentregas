import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Navigation, MapPin, Locate, ExternalLink, Loader2, Signal, SignalZero } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER } from "@/config/maps";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

const DriverGPS = ({ activeRequest, pendingRequests = [], onAcceptRequest }: DriverGPSProps) => {
  const { user } = useAuth();
  const [driverPosition, setDriverPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [watching, setWatching] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const lastSavedRef = useRef<number>(0);

  // Save position to database (throttled to every 5 seconds)
  const savePositionToDb = useCallback(async (lat: number, lng: number, acc: number, hdg: number | null, spd: number | null) => {
    if (!user) return;
    const now = Date.now();
    if (now - lastSavedRef.current < 5000) return;
    lastSavedRef.current = now;

    try {
      const { error } = await (supabase as any)
        .from("driver_locations")
        .upsert({
          user_id: user.id,
          driver_id: user.id,
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          heading: hdg,
          speed: spd,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      if (error) console.error("Erro ao salvar posição:", error);
    } catch (e) {
      console.error("Erro ao salvar posição:", e);
    }
  }, [user]);

  // Kalman filter for GPS smoothing
  const kalmanRef = useRef<{ lat: number; lng: number; variance: number } | null>(null);

  const applyKalmanFilter = useCallback((lat: number, lng: number, accuracy: number) => {
    const processNoise = 0.00001; // movement noise
    if (!kalmanRef.current) {
      kalmanRef.current = { lat, lng, variance: accuracy * accuracy };
      return { lat, lng };
    }
    const k = kalmanRef.current;
    k.variance += processNoise;
    const kalmanGain = k.variance / (k.variance + accuracy * accuracy);
    k.lat = k.lat + kalmanGain * (lat - k.lat);
    k.lng = k.lng + kalmanGain * (lng - k.lng);
    k.variance = (1 - kalmanGain) * k.variance;
    return { lat: k.lat, lng: k.lng };
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("GPS não suportado neste dispositivo");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const filtered = applyKalmanFilter(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        setDriverPosition(filtered);
        setAccuracy(pos.coords.accuracy);
        setHeading(pos.coords.heading);
        setSpeed(pos.coords.speed);
        setWatching(true);
        savePositionToDb(filtered.lat, filtered.lng, pos.coords.accuracy, pos.coords.heading, pos.coords.speed);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Permissão de localização negada.");
        } else {
          toast.error("Erro ao obter localização");
        }
        setWatching(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    setWatchId(id);
  }, [applyKalmanFilter, savePositionToDb]);

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

  const showMap = driverPosition || requestMarkers.length > 0;

  // Initialize and update map
  useEffect(() => {
    if (!showMap || !mapContainerRef.current) return;

    if (!mapRef.current) {
      const center: [number, number] = driverPosition
        ? [driverPosition.lat, driverPosition.lng]
        : requestMarkers[0]
          ? [requestMarkers[0].lat, requestMarkers[0].lng]
          : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

      const map = L.map(mapContainerRef.current).setView(center, 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
    }

    const map = mapRef.current;

    if (driverPosition) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverPosition.lat, driverPosition.lng]);
      } else {
        driverMarkerRef.current = L.marker([driverPosition.lat, driverPosition.lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup("Você está aqui");
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([driverPosition.lat, driverPosition.lng]).setRadius(accuracy);
      } else {
        accuracyCircleRef.current = L.circle([driverPosition.lat, driverPosition.lng], {
          radius: accuracy, fillColor: "#3b82f6", fillOpacity: 0.1, color: "#3b82f6", opacity: 0.3,
        }).addTo(map);
      }
      map.setView([driverPosition.lat, driverPosition.lng]);
    }

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer !== driverMarkerRef.current) {
        map.removeLayer(layer);
      }
    });
    requestMarkers.forEach((m) => {
      L.marker([m.lat, m.lng]).addTo(map)
        .bindPopup(m.name)
        .on("click", () => onAcceptRequest?.(m.id));
    });
  }, [driverPosition, accuracy, requestMarkers.length, showMap]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        driverMarkerRef.current = null;
        accuracyCircleRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-4">
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
                <span className={`font-bold ${accuracy <= 10 ? "text-green-600" : accuracy <= 30 ? "text-yellow-600" : "text-red-500"}`}>±{Math.round(accuracy)}m</span>
              </div>
              {speed !== null && speed > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">🚗 Velocidade</span>
                  <span className="font-bold">{Math.round(speed * 3.6)} km/h</span>
                </div>
              )}
              {heading !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">🧭 Direção</span>
                  <span className="font-bold">{Math.round(heading)}°</span>
                </div>
              )}
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

      {showMap && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mapa ao Vivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 rounded-lg overflow-hidden">
              <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DriverGPS;
