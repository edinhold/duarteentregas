import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Navigation, MapPin, Locate, ExternalLink, Loader2, Signal, SignalZero } from "lucide-react";
import { GoogleMap, MarkerF, CircleF, DirectionsRenderer } from "@react-google-maps/api";
import { DEFAULT_CENTER, DEFAULT_ZOOM, GOOGLE_MAPS_API_KEY } from "@/config/maps";

const hasMapsKey = GOOGLE_MAPS_API_KEY !== ("YOUR_GOOGLE_MAPS_API_KEY" as string);

interface DriverGPSProps {
  activeRequest?: any;
  pendingRequests?: any[];
  onAcceptRequest?: (id: string) => void;
}

const DriverGPS = ({ activeRequest, pendingRequests = [], onAcceptRequest }: DriverGPSProps) => {
  const [driverPosition, setDriverPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);
  const [watching, setWatching] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [eta, setEta] = useState<string>("");
  const [distance, setDistance] = useState<string>("");

  // Start/stop GPS tracking
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
        console.error("GPS Error:", err);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Permissão de localização negada. Habilite nas configurações.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error("Localização indisponível");
        } else {
          toast.error("Erro ao obter localização");
        }
        setWatching(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
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

  // Auto-start GPS on mount
  useEffect(() => {
    startTracking();
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Calculate route when driver position and active request available
  useEffect(() => {
    if (!driverPosition || !activeRequest || !hasMapsKey) {
      setDirections(null);
      setEta("");
      setDistance("");
      return;
    }

    const destination = activeRequest.status === "accepted"
      ? activeRequest.pickup_address
      : activeRequest.delivery_address;

    if (!destination) return;

    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: new google.maps.LatLng(driverPosition.lat, driverPosition.lng),
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirections(result);
          const leg = result.routes[0]?.legs[0];
          if (leg) {
            setEta(leg.duration?.text || "");
            setDistance(leg.distance?.text || "");
          }
        }
      }
    );
  }, [driverPosition, activeRequest?.id, activeRequest?.status]);

  // Open external navigation app
  const openNavigation = (address: string, app: "google" | "waze") => {
    if (app === "waze") {
      if (driverPosition) {
        window.open(`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes&ll=${driverPosition.lat},${driverPosition.lng}`, "_blank");
      } else {
        window.open(`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`, "_blank");
      }
    } else {
      if (driverPosition) {
        window.open(`https://www.google.com/maps/dir/${driverPosition.lat},${driverPosition.lng}/${encodeURIComponent(address)}`, "_blank");
      } else {
        window.open(`https://www.google.com/maps/search/${encodeURIComponent(address)}`, "_blank");
      }
    }
  };

  const currentDestination = activeRequest
    ? activeRequest.status === "accepted"
      ? activeRequest.pickup_address
      : activeRequest.delivery_address
    : null;

  const currentDestinationLabel = activeRequest
    ? activeRequest.status === "accepted"
      ? "📦 Coleta"
      : "🏠 Entrega"
    : null;

  // Map markers for pending requests
  const requestMarkers = pendingRequests
    .filter((r: any) => r.restaurants?.latitude && r.restaurants?.longitude)
    .map((r: any) => ({
      id: r.id,
      lat: r.restaurants.latitude,
      lng: r.restaurants.longitude,
      name: r.restaurants.name,
    }));

  const mapCenter = driverPosition || (requestMarkers[0] ? { lat: requestMarkers[0].lat, lng: requestMarkers[0].lng } : DEFAULT_CENTER);

  return (
    <div className="space-y-4">
      {/* GPS Status Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Navigation className="w-4 h-4" /> GPS em Tempo Real
            {watching ? (
              <Badge variant="default" className="ml-auto gap-1 text-xs">
                <Signal className="w-3 h-3" /> Ativo
              </Badge>
            ) : (
              <Badge variant="destructive" className="ml-auto gap-1 text-xs">
                <SignalZero className="w-3 h-3" /> Inativo
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {driverPosition ? (
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">📍 Sua posição</span>
                <span className="font-mono text-xs">
                  {driverPosition.lat.toFixed(5)}, {driverPosition.lng.toFixed(5)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">🎯 Precisão</span>
                <span className={`font-bold ${accuracy <= 20 ? "text-green-600" : accuracy <= 50 ? "text-yellow-600" : "text-red-500"}`}>
                  ±{Math.round(accuracy)}m
                </span>
              </div>
              {eta && distance && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">⏱️ Tempo estimado</span>
                    <span className="font-bold text-primary">{eta}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">📏 Distância</span>
                    <span className="font-bold">{distance}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Obtendo localização...</span>
            </div>
          )}

          <div className="flex gap-2">
            {!watching ? (
              <Button onClick={startTracking} size="sm" className="flex-1">
                <Locate className="w-4 h-4 mr-1" /> Ativar GPS
              </Button>
            ) : (
              <Button onClick={stopTracking} size="sm" variant="outline" className="flex-1">
                Pausar GPS
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Navigation Buttons for Active Request */}
      {activeRequest && currentDestination && (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> 
              {currentDestinationLabel} — Navegar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{currentDestination}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => openNavigation(currentDestination, "google")}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Google Maps
              </Button>
              <Button
                onClick={() => openNavigation(currentDestination, "waze")}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Waze
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Map */}
      {hasMapsKey && (driverPosition || requestMarkers.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mapa ao Vivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 rounded-lg overflow-hidden">
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={mapCenter}
                zoom={14}
              >
                {/* Driver position marker */}
                {driverPosition && (
                  <>
                    <MarkerF
                      position={driverPosition}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: "#3b82f6",
                        fillOpacity: 1,
                        strokeColor: "#fff",
                        strokeWeight: 3,
                      }}
                      title="Você está aqui"
                    />
                    <CircleF
                      center={driverPosition}
                      radius={accuracy}
                      options={{
                        fillColor: "#3b82f6",
                        fillOpacity: 0.1,
                        strokeColor: "#3b82f6",
                        strokeOpacity: 0.3,
                        strokeWeight: 1,
                      }}
                    />
                  </>
                )}

                {/* Request markers */}
                {requestMarkers.map((m) => (
                  <MarkerF
                    key={m.id}
                    position={{ lat: m.lat, lng: m.lng }}
                    title={m.name}
                    onClick={() => onAcceptRequest?.(m.id)}
                  />
                ))}

                {/* Directions route */}
                {directions && (
                  <DirectionsRenderer
                    directions={directions}
                    options={{
                      suppressMarkers: true,
                      polylineOptions: {
                        strokeColor: "#f97316",
                        strokeWeight: 5,
                        strokeOpacity: 0.8,
                      },
                    }}
                  />
                )}
              </GoogleMap>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DriverGPS;
