import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReportLocationButton from "@/components/ReportLocationButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navigation, MapPin, Locate, ExternalLink, Loader2, Signal, SignalZero, Shield, Pause, Crosshair, Layers, RotateCcw } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, MAP_LAYERS, GOOGLE_MAPS_API_KEY } from "@/config/maps";
import { useAuth } from "@/contexts/AuthContext";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import { resumeAudioContext } from "@/lib/notificationSound";

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

const destIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const qualityConfig = {
  excellent: { color: "text-green-600", label: "Excelente", icon: "🟢" },
  good: { color: "text-green-500", label: "Boa", icon: "🟡" },
  fair: { color: "text-yellow-600", label: "Regular", icon: "🟠" },
  poor: { color: "text-red-500", label: "Fraca", icon: "🔴" },
};

interface DriverGPSProps {
  activeRequest?: any;
  pendingRequests?: any[];
  onAcceptRequest?: (id: string) => void;
}

const DriverGPS = ({ activeRequest, pendingRequests = [], onAcceptRequest }: DriverGPSProps) => {
  const { user } = useAuth();
  const {
    position: driverPosition,
    accuracy,
    heading,
    speed,
    watching,
    gpsQuality,
    sampleCount,
    isStationary,
    totalDistance,
    permissionStatus,
    errorStatus,
    startTracking,
    stopTracking,
  } = useGPSTracking({ userId: user?.id });

  const [autoFollow, setAutoFollow] = useState(true);
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("google");

  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

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

  const showMap = true; // Always show map frame
  const qc = qualityConfig[gpsQuality];

  // Initialize and update map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const center: [number, number] = driverPosition
        ? [driverPosition.lat, driverPosition.lng]
        : requestMarkers.length > 0
          ? [requestMarkers[0].lat, requestMarkers[0].lng]
          : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

      const map = L.map(mapContainerRef.current).setView(center, 15);
      tileLayerRef.current = L.tileLayer(MAP_LAYERS[mapType].url, {
        attribution: MAP_LAYERS[mapType].attribution,
        maxZoom: mapType.includes("satellite") || mapType.includes("google") ? 20 : 19,
      }).addTo(map);
      mapRef.current = map;
    }

    const map = mapRef.current;

    // Update tile layer if mapType changed
    if (tileLayerRef.current && map) {
      const currentUrl = MAP_LAYERS[mapType].url;
      if ((tileLayerRef.current as any)._url !== currentUrl) {
        map.removeLayer(tileLayerRef.current);
        tileLayerRef.current = L.tileLayer(currentUrl, {
          attribution: MAP_LAYERS[mapType].attribution,
          maxZoom: mapType.includes("satellite") || mapType.includes("google") ? 20 : 19,
        }).addTo(map);
      }
    }

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

      // Auto-follow: center on driver
      if (autoFollow) {
        map.setView([driverPosition.lat, driverPosition.lng], map.getZoom());
      }
    }

    // Update destination marker for active request
    if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    // If there's a restaurant location on the active request, show it
    if (activeRequest?.restaurants?.latitude && activeRequest?.restaurants?.longitude) {
      const destLat = activeRequest.restaurants.latitude;
      const destLng = activeRequest.restaurants.longitude;
      const label = activeRequest.status === "accepted" ? "📦 Coleta" : "🏠 Entrega";

      destMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon })
        .addTo(map)
        .bindPopup(`<b>${label}</b><br/>${activeRequest.restaurants.name || ""}`);

      if (driverPosition) {
        routeLineRef.current = L.polyline(
          [[driverPosition.lat, driverPosition.lng], [destLat, destLng]],
          { color: "#e53935", weight: 3, dashArray: "8 4", opacity: 0.7 }
        ).addTo(map);
      }
    }

    // Pending request markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer !== driverMarkerRef.current && layer !== destMarkerRef.current) {
        map.removeLayer(layer);
      }
    });
    requestMarkers.forEach((m) => {
      L.marker([m.lat, m.lng]).addTo(map)
        .bindPopup(m.name)
        .on("click", () => onAcceptRequest?.(m.id));
    });
  }, [driverPosition, accuracy, requestMarkers.length, showMap, autoFollow, activeRequest?.id, activeRequest?.status, mapType]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        driverMarkerRef.current = null;
        accuracyCircleRef.current = null;
        destMarkerRef.current = null;
        routeLineRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Navigation className="w-4 h-4" /> GPS em Tempo Real
            {isStationary && watching && (
              <Badge variant="outline" className="gap-1 text-xs ml-1"><Pause className="w-3 h-3" /> Parado</Badge>
            )}
            {watching ? (
              <Badge variant="default" className="ml-auto gap-1 text-xs"><Signal className="w-3 h-3" /> Ativo</Badge>
            ) : (
              <Badge variant="destructive" className="ml-auto gap-1 text-xs"><SignalZero className="w-3 h-3" /> Inativo</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {permissionStatus === "denied" && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Acesso à localização negado. Por favor, ative nas configurações do navegador.</span>
            </div>
          )}
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
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground"><Shield className="w-3 h-3 inline mr-1" />Qualidade</span>
                <span className={`font-bold ${qc.color}`}>{qc.icon} {qc.label}</span>
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
              {totalDistance > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">📏 Distância</span>
                  <span className="font-bold text-primary">
                    {totalDistance >= 1000 ? `${(totalDistance / 1000).toFixed(2)} km` : `${Math.round(totalDistance)} m`}
                  </span>
                </div>
              )}
              {sampleCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">📊 Amostras</span>
                  <span className="text-xs text-muted-foreground">{sampleCount} válidas</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-4 text-muted-foreground border rounded-lg bg-muted/20">
              {errorStatus ? (
                <>
                  <SignalZero className="w-8 h-8 text-destructive animate-pulse" />
                  <p className="text-sm text-center px-4 font-medium text-destructive">{errorStatus}</p>
                  <Button variant="outline" size="sm" onClick={startTracking} className="mt-2">
                    Tentar Novamente
                  </Button>
                </>
              ) : (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-sm font-medium">Buscando sinal do GPS...</span>
                  <p className="text-xs text-muted-foreground px-4 text-center">Isso pode levar alguns segundos, certifique-se de estar em local aberto.</p>
                </>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {!watching ? (
              <Button onClick={() => { resumeAudioContext(); startTracking(); }} size="sm" className="flex-1 font-bold"><Locate className="w-4 h-4 mr-1" /> Ativar GPS</Button>
            ) : (
              <div className="flex gap-2 w-full">
                <Button onClick={startTracking} size="sm" variant="outline" className="flex-1 gap-1 text-xs">
                  <RotateCcw className="w-3 h-3" /> Atualizar
                </Button>
                <Button onClick={stopTracking} size="sm" variant="secondary" className="flex-1 gap-1 text-xs text-destructive">
                  <Pause className="w-3 h-3" /> Pausar
                </Button>
              </div>
            )}
          </div>
          {driverPosition && user?.id && (
            <ReportLocationButton
              latitude={driverPosition.lat}
              longitude={driverPosition.lng}
              userId={user.id}
            />
          )}
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

      <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Mapa ao Vivo</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const types: (keyof typeof MAP_LAYERS)[] = ["google", "googleHybrid", "streets", "satellite"];
                    const next = types[(types.indexOf(mapType) + 1) % types.length];
                    setMapType(next);
                  }}
                  className="gap-1 text-xs h-7"
                >
                  <Layers className="w-3 h-3" />
                  {mapType === "google" ? "Google" : mapType === "googleHybrid" ? "Híbrido" : mapType === "streets" ? "OSM" : "Satélite"}
                </Button>
                <Button
                  variant={autoFollow ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAutoFollow(!autoFollow)}
                  className="gap-1 text-xs h-7"
                >
                  <Crosshair className="w-3 h-3" />
                  {autoFollow ? "Seguindo" : "Seguir"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[450px] rounded-lg overflow-hidden shadow-inner border">
              <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
            </div>
          </CardContent>
      </Card>
    </div>
  );
};

export default DriverGPS;
