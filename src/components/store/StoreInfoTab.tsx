import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Store, Save, MapPin, Navigation, RotateCcw } from "lucide-react";
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

const storePin = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

interface StoreInfoTabProps {
  restaurant: any;
  userId: string;
}

const StoreInfoTab = ({ restaurant, userId }: StoreInfoTabProps) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    delivery_time: "30-45 min",
    delivery_fee: "0",
    min_order: "0",
    is_open: true,
    latitude: "",
    longitude: "",
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name || "",
        address: restaurant.address || "",
        delivery_time: restaurant.delivery_time || "30-45 min",
        delivery_fee: String(restaurant.delivery_fee || 0),
        min_order: String(restaurant.min_order || 0),
        is_open: restaurant.is_open ?? true,
        latitude: restaurant.latitude ? String(restaurant.latitude) : "",
        longitude: restaurant.longitude ? String(restaurant.longitude) : "",
      });
    }
  }, [restaurant]);

  const updateMarkerPosition = useCallback((lat: number, lng: number) => {
    setForm(f => ({ ...f, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }));

    if (mapRef.current) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { icon: storePin, draggable: true })
          .addTo(mapRef.current)
          .bindPopup("<b>📍 Localização da Loja</b>");

        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          setForm(f => ({ ...f, latitude: pos.lat.toFixed(7), longitude: pos.lng.toFixed(7) }));
          reverseGeocode(pos.lat, pos.lng);
        });
      }
      mapRef.current.setView([lat, lng], 17);
    }
  }, []);

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`)
      .then(r => r.json())
      .then(data => {
        if (data?.address) {
          const a = data.address;
          const parts: string[] = [];
          const road = a.road || a.pedestrian || a.footway || a.street || "";
          if (road) parts.push(a.house_number ? `${road}, ${a.house_number}` : road);
          const neighborhood = a.suburb || a.neighbourhood || a.quarter || "";
          if (neighborhood) parts.push(neighborhood);
          const city = a.city || a.town || a.village || a.municipality || "";
          if (city) parts.push(city);
          if (a.state) parts.push(a.state);
          if (parts.length > 0) {
            setForm(f => ({ ...f, address: parts.join(", ") }));
          }
        }
      })
      .catch(() => {});
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const lat = parseFloat(form.latitude) || -23.5505;
    const lng = parseFloat(form.longitude) || -46.6333;

    const map = L.map(mapContainerRef.current).setView([lat, lng], form.latitude ? 17 : 12);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // If we already have coordinates, place the marker
    if (form.latitude && form.longitude) {
      markerRef.current = L.marker([parseFloat(form.latitude), parseFloat(form.longitude)], { icon: storePin, draggable: true })
        .addTo(map)
        .bindPopup("<b>📍 Localização da Loja</b>");

      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        setForm(f => ({ ...f, latitude: pos.lat.toFixed(7), longitude: pos.lng.toFixed(7) }));
        reverseGeocode(pos.lat, pos.lng);
      });
    }

    // Click to place/move marker
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      updateMarkerPosition(clickLat, clickLng);
      reverseGeocode(clickLat, clickLng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Sync marker when form coords change from restaurant load
  useEffect(() => {
    if (!mapRef.current) return;
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      if (markerRef.current) {
        const cur = markerRef.current.getLatLng();
        if (Math.abs(cur.lat - lat) > 0.0001 || Math.abs(cur.lng - lng) > 0.0001) {
          markerRef.current.setLatLng([lat, lng]);
          mapRef.current.setView([lat, lng], 17);
        }
      } else {
        updateMarkerPosition(lat, lng);
      }
    }
  }, [restaurant?.latitude, restaurant?.longitude]);

  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      toast.error("GPS não suportado neste navegador");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        updateMarkerPosition(lat, lng);
        reverseGeocode(lat, lng);
        setGpsLoading(false);
        toast.success(`📍 Localização GPS obtida (precisão: ${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setGpsLoading(false);
        toast.error(err.code === 1 ? "Permissão GPS negada" : "Erro ao obter localização GPS");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Nome da loja é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const lat = parseFloat(form.latitude);
      const lng = parseFloat(form.longitude);

      const payload: any = {
        name: form.name,
        address: form.address || null,
        delivery_time: form.delivery_time,
        delivery_fee: parseFloat(form.delivery_fee) || 0,
        min_order: parseFloat(form.min_order) || 0,
        is_open: form.is_open,
      };

      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        payload.latitude = lat;
        payload.longitude = lng;
      }

      if (restaurant) {
        const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurant.id);
        if (error) throw error;
        toast.success("Dados atualizados!");
      } else {
        const { error } = await supabase.from("restaurants").insert({
          ...payload,
          owner_id: userId,
          category_name: "Geral",
        });
        if (error) throw error;
        toast.success("Loja criada!");
      }
      queryClient.invalidateQueries({ queryKey: ["my-restaurant", userId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Store className="w-4 h-4" /> Minha Loja
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Nome da loja *</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome do estabelecimento" />
        </div>
        <div className="space-y-2">
          <Label>Endereço</Label>
          <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro" />
        </div>

        {/* Location Map */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Localização no Mapa
          </Label>
          <p className="text-xs text-muted-foreground">
            Clique no mapa ou arraste o marcador para definir a posição exata da sua loja. Isso garante precisão no Google Maps e Waze.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleUseGPS} disabled={gpsLoading}>
              <Navigation className="w-4 h-4 mr-1" />
              {gpsLoading ? "Buscando..." : "Usar meu GPS"}
            </Button>
          </div>
          <div
            ref={mapContainerRef}
            className="w-full h-[250px] rounded-lg border border-border overflow-hidden z-0"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Latitude</Label>
              <Input
                value={form.latitude}
                onChange={(e) => {
                  setForm(f => ({ ...f, latitude: e.target.value }));
                  const lat = parseFloat(e.target.value);
                  const lng = parseFloat(form.longitude);
                  if (!isNaN(lat) && !isNaN(lng)) updateMarkerPosition(lat, lng);
                }}
                placeholder="-23.5505"
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Longitude</Label>
              <Input
                value={form.longitude}
                onChange={(e) => {
                  setForm(f => ({ ...f, longitude: e.target.value }));
                  const lat = parseFloat(form.latitude);
                  const lng = parseFloat(e.target.value);
                  if (!isNaN(lat) && !isNaN(lng)) updateMarkerPosition(lat, lng);
                }}
                placeholder="-46.6333"
                className="text-xs"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Tempo de entrega</Label>
            <Input value={form.delivery_time} onChange={(e) => setForm((f) => ({ ...f, delivery_time: e.target.value }))} placeholder="30-45 min" />
          </div>
          <div className="space-y-2">
            <Label>Taxa de entrega (R$)</Label>
            <Input type="number" step="0.01" min="0" value={form.delivery_fee} onChange={(e) => setForm((f) => ({ ...f, delivery_fee: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Pedido mínimo (R$)</Label>
            <Input type="number" step="0.01" min="0" value={form.min_order} onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={form.is_open} onCheckedChange={(v) => setForm((f) => ({ ...f, is_open: v }))} />
            <Label>{form.is_open ? "Aberto" : "Fechado"}</Label>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="w-4 h-4 mr-2" /> {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default StoreInfoTab;
