import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Truck, DollarSign, MapPin } from "lucide-react";
import ChatWidget from "@/components/ChatWidget";
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

const storeIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const deliveryIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%2322c55e" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
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

// Haversine distance in km
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface CallDriverTabProps {
  user: any;
  restaurant: any;
  requests: any[];
  activeRequest: any;
  chatMessages: any[];
}

const CallDriverTab = ({ user, restaurant, requests, activeRequest, chatMessages }: CallDriverTabProps) => {
  const queryClient = useQueryClient();
  const [callForm, setCallForm] = useState({ pickup: "", delivery: "", notes: "" });
  const [calling, setCalling] = useState(false);
  const [deliveryLatLng, setDeliveryLatLng] = useState<[number, number] | null>(null);
  const { data: driverLocations = [] } = useDriverLocations();

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data } = await supabase.from("delivery_config").select("*").limit(1).single();
      return data;
    },
  });

  const baseFee = deliveryConfig?.base_fee ?? 5;
  const feePerKm = deliveryConfig?.fee_per_km ?? 1.5;

  const storeLat = restaurant?.latitude;
  const storeLng = restaurant?.longitude;

  const distanceKm = deliveryLatLng && storeLat && storeLng
    ? haversineKm(storeLat, storeLng, deliveryLatLng[0], deliveryLatLng[1])
    : 0;
  const deliveryCost = baseFee + feePerKm * distanceKm;

  const statusLabels: Record<string, string> = {
    pending: "Aguardando", accepted: "Aceito", picked_up: "Coletado", delivered: "Entregue", cancelled: "Cancelado",
  };

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = storeLat && storeLng
      ? [storeLat, storeLng]
      : [-23.5505, -46.6333];

    const map = L.map(containerRef.current).setView(center, 14);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Store marker
    if (storeLat && storeLng) {
      L.marker([storeLat, storeLng], { icon: storeIcon })
        .addTo(map)
        .bindPopup(`<b>🏪 ${restaurant?.name || "Sua Loja"}</b>`);
    }

    // Click to set delivery point
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setDeliveryLatLng([lat, lng]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [storeLat, storeLng]);

  // Update delivery marker + route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old delivery marker
    if (deliveryMarkerRef.current) {
      map.removeLayer(deliveryMarkerRef.current);
      deliveryMarkerRef.current = null;
    }
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (deliveryLatLng) {
      deliveryMarkerRef.current = L.marker(deliveryLatLng, { icon: deliveryIcon })
        .addTo(map)
        .bindPopup("<b>📍 Ponto de Entrega</b>")
        .openPopup();

      if (storeLat && storeLng) {
        routeLineRef.current = L.polyline(
          [[storeLat, storeLng], deliveryLatLng],
          { color: "#3b82f6", weight: 3, dashArray: "8 4", opacity: 0.7 }
        ).addTo(map);
      }
    }
  }, [deliveryLatLng, storeLat, storeLng]);

  // Update driver markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old driver markers (circles + markers with driverMapIcon class)
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker || (layer instanceof L.Marker && layer !== deliveryMarkerRef.current)) {
        // Don't remove the store marker or delivery marker
        const latlng = layer.getLatLng();
        const isStore = storeLat && storeLng && Math.abs(latlng.lat - storeLat) < 0.0001 && Math.abs(latlng.lng - storeLng) < 0.0001;
        const isDelivery = deliveryLatLng && Math.abs(latlng.lat - deliveryLatLng[0]) < 0.0001 && Math.abs(latlng.lng - deliveryLatLng[1]) < 0.0001;
        if (!isStore && !isDelivery) {
          map.removeLayer(layer);
        }
      }
    });

    // Add driver markers
    driverLocations.forEach((d: any) => {
      L.marker([d.latitude, d.longitude], { icon: driverMapIcon })
        .addTo(map)
        .bindPopup(`<b>🚴 Entregador</b><br/>${d.speed ? `${Math.round(d.speed * 3.6)} km/h` : "Parado"}`);
    });
  }, [driverLocations, storeLat, storeLng, deliveryLatLng]);

  const handleCallDriver = async () => {
    if (!callForm.pickup.trim() || !callForm.delivery.trim()) {
      toast.error("Preencha endereço de coleta e entrega");
      return;
    }
    if (distanceKm <= 0) {
      toast.error("Clique no mapa para definir o ponto de entrega");
      return;
    }
    setCalling(true);
    try {
      const { error } = await supabase.rpc("deduct_credits_for_delivery", {
        p_pickup_address: callForm.pickup,
        p_delivery_address: callForm.delivery,
        p_notes: callForm.notes || null,
        p_restaurant_id: restaurant?.id || null,
        p_distance_km: distanceKm,
      } as any);
      if (error) throw error;
      toast.success(`Entregador chamado! Custo: R$ ${deliveryCost.toFixed(2)}`);
      setCallForm({ pickup: "", delivery: "", notes: "" });
      setDeliveryLatLng(null);
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao chamar entregador");
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Map showing drivers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Mapa — Clique para definir o ponto de entrega
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div ref={containerRef} style={{ width: "100%", height: 300, borderRadius: 8 }} />
          <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">🔴 Sua loja</span>
            <span className="flex items-center gap-1">🟢 Ponto de entrega</span>
            <span className="flex items-center gap-1">🔵 Entregadores</span>
          </div>
        </CardContent>
      </Card>

      {/* Call Driver */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4" /> Chamar Entregador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Endereço de coleta *</Label>
            <Input value={callForm.pickup} onChange={(e) => setCallForm(f => ({ ...f, pickup: e.target.value }))} placeholder={restaurant?.address || "Endereço da loja"} />
          </div>
          <div className="space-y-2">
            <Label>Endereço de entrega *</Label>
            <Input value={callForm.delivery} onChange={(e) => setCallForm(f => ({ ...f, delivery: e.target.value }))} placeholder="Endereço do cliente" />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={callForm.notes} onChange={(e) => setCallForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Detalhes da entrega..." />
          </div>

          {distanceKm > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 border border-accent">
              <DollarSign className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Valor da corrida: <span className="text-primary">R$ {deliveryCost.toFixed(2).replace(".", ",")}</span></p>
                <p className="text-xs text-muted-foreground">
                  Taxa fixa R$ {baseFee.toFixed(2).replace(".", ",")} + {distanceKm.toFixed(1)} km × R$ {feePerKm.toFixed(2).replace(".", ",")} = R$ {(feePerKm * distanceKm).toFixed(2).replace(".", ",")}
                </p>
              </div>
            </div>
          )}

          {distanceKm <= 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              📍 Clique no mapa acima para definir o ponto de entrega e calcular o valor automaticamente
            </p>
          )}

          <Button onClick={handleCallDriver} disabled={calling || distanceKm <= 0} className="w-full">
            {calling ? "Chamando..." : distanceKm > 0 ? `📲 Chamar Entregador (R$ ${deliveryCost.toFixed(2).replace(".", ",")})` : "📲 Defina o ponto de entrega no mapa"}
          </Button>
        </CardContent>
      </Card>

      {/* Chat with driver */}
      {activeRequest && (
        <ChatWidget
          deliveryRequestId={activeRequest.id}
          currentUserId={user.id}
          title="Chat com Entregador"
        />
      )}

      {/* Delivery History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entregas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Nenhuma entrega solicitada</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r: any) => (
                <div key={r.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-bold">#{r.id.slice(0, 8)}</p>
                    <Badge variant={r.status === "delivered" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"}>
                      {statusLabels[r.status] || r.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">📍 {r.pickup_address} → {r.delivery_address}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CallDriverTab;
