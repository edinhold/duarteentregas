import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Truck, DollarSign, MapPin, Navigation, Search, Route, Car, Bike, Footprints, Clock, Pencil, RotateCcw, AlertTriangle, Layers, Heart, Star, Code } from "lucide-react";
import ReportLocationButton from "@/components/ReportLocationButton";
import ChatWidget from "@/components/ChatWidget";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_LAYERS, GOOGLE_MAPS_API_KEY } from "@/config/maps";

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

// Haversine as fallback only
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type RouteProfile = "driving" | "cycling" | "walking";

const PROFILE_CONFIG: Record<RouteProfile, { label: string; icon: typeof Car; osrmProfile: string }> = {
  driving: { label: "Carro/Moto", icon: Car, osrmProfile: "driving" },
  cycling: { label: "Bicicleta", icon: Bike, osrmProfile: "bike" },
  walking: { label: "A pé", icon: Footprints, osrmProfile: "foot" },
};

// OSRM route fetcher — returns road distance (km), duration (min), and route geometry
async function fetchOSRMRoute(
  fromLat: number, fromLng: number, toLat: number, toLng: number,
  profile: RouteProfile = "driving"
): Promise<{ distanceKm: number; durationMin: number; geometry: [number, number][] } | null> {
  try {
    const osrmProfile = PROFILE_CONFIG[profile].osrmProfile;
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&alternatives=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === "Ok" && data.routes?.[0]) {
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
      return {
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        geometry: coords,
      };
    }
  } catch (err) {
    console.error("OSRM route error:", err);
  }
  return null;
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
  const [storeLatLng, setStoreLatLng] = useState<[number, number] | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { data: driverLocations = [] } = useDriverLocations();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const { data: favoriteDrivers = [] } = useQuery({
    queryKey: ["favorite-drivers", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const { data, error } = await supabase
        .from("store_driver_favorites")
        .select("driver_id, driver:drivers(id, user_id, full_name, driver_code)")
        .eq("restaurant_id", restaurant.id);
      if (error) return [];
      return data;
    },
    enabled: !!restaurant?.id,
  });
  const gpsWatchRef = useRef<number | null>(null);

  // Route profile & road distance state
  const [routeProfile, setRouteProfile] = useState<RouteProfile>("driving");
  const [roadDistanceKm, setRoadDistanceKm] = useState(0);
  const [roadDurationMin, setRoadDurationMin] = useState(0);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Manual distance override
  const [manualDistanceEnabled, setManualDistanceEnabled] = useState(false);
  const [manualDistanceKm, setManualDistanceKm] = useState("");

  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("streets");
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const driverMarkersRef = useRef<L.Marker[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data } = await supabase.from("public_delivery_config").select("*").limit(1).single();
      return data;
    },
  });

  const baseFee = deliveryConfig?.base_fee ?? 5;
  const feePerKm = deliveryConfig?.fee_per_km ?? 1.5;
  const minKm = (deliveryConfig as any)?.min_km ?? 0;
  const maxKm = (deliveryConfig as any)?.max_km ?? 0;
  const roundKmUp = !!(deliveryConfig as any)?.round_km_up;

  const storeLat = storeLatLng?.[0] ?? restaurant?.latitude;
  const storeLng = storeLatLng?.[1] ?? restaurant?.longitude;

  // Distance logic: manual override > OSRM road > Haversine fallback
  const autoDistanceKm = roadDistanceKm > 0
    ? roadDistanceKm
    : (deliveryLatLng && storeLat && storeLng ? haversineKm(storeLat, storeLng, deliveryLatLng[0], deliveryLatLng[1]) : 0);

  const rawDistanceKm = manualDistanceEnabled && parseFloat(manualDistanceKm) > 0
    ? parseFloat(manualDistanceKm)
    : autoDistanceKm;

  // Apply km rules (same as DB function)
  let effectiveKm = rawDistanceKm;
  if (roundKmUp && effectiveKm > 0) effectiveKm = Math.ceil(effectiveKm);
  if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;
  if (maxKm > 0 && effectiveKm > maxKm) effectiveKm = maxKm;

  const distanceKm = rawDistanceKm;
  const deliveryCost = baseFee + feePerKm * effectiveKm;

  const distanceSource = manualDistanceEnabled && parseFloat(manualDistanceKm) > 0
    ? "manual"
    : roadDistanceKm > 0 ? "osrm" : (autoDistanceKm > 0 ? "haversine" : "none");

  const statusLabels: Record<string, string> = {
    pending: "Aguardando", accepted: "Aceito", picked_up: "Coletado", delivered: "Finalizado", cancelled: "Cancelado",
  };

  // Fetch OSRM route when both points are set or profile changes
  useEffect(() => {
    if (!storeLat || !storeLng || !deliveryLatLng) {
      setRoadDistanceKm(0);
      setRoadDurationMin(0);
      setRouteCoords([]);
      return;
    }

    let cancelled = false;
    setLoadingRoute(true);

    fetchOSRMRoute(storeLat, storeLng, deliveryLatLng[0], deliveryLatLng[1], routeProfile).then((result) => {
      if (cancelled) return;
      if (result) {
        setRoadDistanceKm(result.distanceKm);
        setRoadDurationMin(result.durationMin);
        setRouteCoords(result.geometry);
      } else {
        setRoadDistanceKm(0);
        setRoadDurationMin(0);
        setRouteCoords([]);
      }
      setLoadingRoute(false);
    });

    return () => { cancelled = true; };
  }, [storeLat, storeLng, deliveryLatLng?.[0], deliveryLatLng?.[1], routeProfile]);

  const formatAddress = useCallback((data: any): string => {
    if (!data?.address) return data?.display_name ?? "";
    const a = data.address;
    const parts: string[] = [];
    // Street + number
    const road = a.road || a.pedestrian || a.footway || a.street || "";
    if (road) {
      parts.push(a.house_number ? `${road}, ${a.house_number}` : road);
    }
    // Neighborhood
    const neighborhood = a.suburb || a.neighbourhood || a.quarter || "";
    if (neighborhood) parts.push(neighborhood);
    // City
    const city = a.city || a.town || a.village || a.municipality || "";
    if (city) parts.push(city);
    // State
    if (a.state) parts.push(a.state);
    return parts.length > 0 ? parts.join(", ") : data.display_name;
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      if (GOOGLE_MAPS_API_KEY) {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`);
        const data = await res.json();
        if (data.status === "OK" && data.results?.[0]) {
          setCallForm(f => ({ ...f, pickup: data.results[0].formatted_address }));
          return;
        }
      }
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`);
      const data = await res.json();
      if (data) {
        const formatted = formatAddress(data);
        setCallForm(f => ({ ...f, pickup: formatted }));
      }
    } catch (err) {
      console.error("Reverse geocode error:", err);
    }
  }, [formatAddress]);

  const startGPSWatch = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste navegador");
      setGpsStatus("denied");
      return;
    }
    if (gpsWatchRef.current !== null) return; // already watching

    setGpsStatus("requesting");

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        const prev = storeLatLng;

        setGpsAccuracy(acc);
        setStoreLatLng([lat, lng]);
        setGpsStatus("granted");

        // Only reverse-geocode if position changed significantly (>50m) or first time
        if (!prev || haversineKm(prev[0], prev[1], lat, lng) > 0.05) {
          reverseGeocode(lat, lng);
        }
      },
      (err) => {
        console.error("GPS error:", err);
        setGpsStatus("denied");
        if (err.code === 1) {
          toast.error("Permissão de GPS negada. Ative nas configurações do navegador.");
        } else {
          toast.error("Não foi possível obter sua localização");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
    );

    gpsWatchRef.current = watchId;
  }, [reverseGeocode, storeLatLng]);

  const stopGPSWatch = useCallback(() => {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
  }, []);

  // Auto-start GPS or use restaurant coords
  useEffect(() => {
    if (restaurant?.latitude && restaurant?.longitude) {
      setStoreLatLng([restaurant.latitude, restaurant.longitude]);
      setGpsStatus("granted");
      if (restaurant.address) {
        setCallForm(f => f.pickup ? f : { ...f, pickup: restaurant.address });
      } else {
        reverseGeocode(restaurant.latitude, restaurant.longitude);
      }
    } else {
      startGPSWatch();
    }

    return () => stopGPSWatch();
  }, [restaurant?.latitude, restaurant?.longitude]);

  // Request GPS manually (button)
  const requestGPS = useCallback(() => {
    stopGPSWatch();
    gpsWatchRef.current = null;
    startGPSWatch();
    toast.info("📡 Buscando localização em tempo real...");
  }, [startGPSWatch, stopGPSWatch]);

  const geocodeDeliveryAddress = useCallback((address: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (address.trim().length < 5) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        if (GOOGLE_MAPS_API_KEY) {
          let googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&components=country:BR`;
          if (storeLat && storeLng) {
            googleUrl += `&location=${storeLat},${storeLng}&radius=50000`;
          }
          const res = await fetch(googleUrl);
          const data = await res.json();
          if (data.status === "OK" && data.results?.length > 0) {
            const mapped = data.results.map((r: any) => ({
              display_name: r.formatted_address,
              lat: r.geometry.location.lat.toString(),
              lon: r.geometry.location.lng.toString(),
              address: r.address_components
            }));
            setAddressSuggestions(mapped);
            setShowSuggestions(true);
            setSearchingAddress(false);
            return;
          }
        }

        // Fallback to Nominatim
        let searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=5&countrycodes=br&addressdetails=1&accept-language=pt-BR`;
        
        if (storeLat && storeLng) {
          const delta = 0.25;
          searchUrl += `&viewbox=${storeLng - delta},${storeLat - delta},${storeLng + delta},${storeLat + delta}&bounded=1`;
        }
        
        const res = await fetch(searchUrl);
        const data = await res.json();
        if (data && data.length > 0) {
          if (storeLat && storeLng) {
            data.sort((a: any, b: any) => {
              const da = haversineKm(storeLat, storeLng, parseFloat(a.lat), parseFloat(a.lon));
              const db = haversineKm(storeLat, storeLng, parseFloat(b.lat), parseFloat(b.lon));
              return da - db;
            });
          }
          setAddressSuggestions(data);
          setShowSuggestions(true);
        } else {
          setAddressSuggestions([]);
          setShowSuggestions(false);
          toast.info("Endereço não encontrado. Toque no mapa para marcar a localização manualmente.", { duration: 5000 });
        }
      } catch (err) {
        console.error("Geocode error:", err);
      } finally {
        setSearchingAddress(false);
      }
    }, 800);
  }, [storeLat, storeLng]);

  const selectSuggestion = useCallback((item: any) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setDeliveryLatLng([lat, lng]);
    const formatted = formatAddress(item);
    setCallForm(f => ({ ...f, delivery: formatted }));
    setAddressSuggestions([]);
    setShowSuggestions(false);
    setManualDistanceEnabled(false);

    if (mapRef.current && storeLat && storeLng) {
      const bounds = L.latLngBounds([[storeLat, storeLng], [lat, lng]]);
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [storeLat, storeLng, formatAddress]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = storeLat && storeLng
      ? [storeLat, storeLng]
      : [-15.5454, -54.2958];

    const map = L.map(containerRef.current).setView(center, 14);
    mapRef.current = map;
    
    tileLayerRef.current = L.tileLayer(MAP_LAYERS[mapType].url, {
      attribution: MAP_LAYERS[mapType].attribution,
      maxZoom: mapType === "satellite" ? 18 : 19,
    }).addTo(map);

    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setDeliveryLatLng([lat, lng]);
      setManualDistanceEnabled(false);
      
      try {
        if (GOOGLE_MAPS_API_KEY) {
          const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`);
          const data = await res.json();
          if (data.status === "OK" && data.results?.[0]) {
            setCallForm(f => ({ ...f, delivery: data.results[0].formatted_address }));
            return;
          }
        }

        // Fallback to Nominatim
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`);
        const data = await res.json();
        if (data) {
          const formatted = formatAddress(data);
          setCallForm(f => ({ ...f, delivery: formatted }));
        }
      } catch (err) {
        console.error("Map click geocode error:", err);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update tile layer if mapType changed
  useEffect(() => {
    const map = mapRef.current;
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
  }, [mapType]);

  // Update store marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !storeLat || !storeLng) return;

    if (storeMarkerRef.current) map.removeLayer(storeMarkerRef.current);

    storeMarkerRef.current = L.marker([storeLat, storeLng], { icon: storeIcon })
      .addTo(map)
      .bindPopup(`<b>🏪 ${restaurant?.name || "Sua Loja"}</b>`);

    // Only set view if not manual dragging or searching
    if (!deliveryLatLng && !searchingAddress) {
      map.setView([storeLat, storeLng], map.getZoom());
    }
  }, [storeLat, storeLng, restaurant?.name]);

  // Update delivery marker + route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (deliveryMarkerRef.current) {
      map.removeLayer(deliveryMarkerRef.current);
      deliveryMarkerRef.current = null;
    }
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (deliveryLatLng) {
      deliveryMarkerRef.current = L.marker(deliveryLatLng, { icon: deliveryIcon, draggable: true })
        .addTo(map)
        .bindPopup("<b>📍 Ponto de Entrega</b><br><small>Arraste para ajustar</small>")
        .openPopup();

      // Reverse geocode on drag end
      deliveryMarkerRef.current.on("dragend", async () => {
        const pos = deliveryMarkerRef.current?.getLatLng();
        if (pos) {
          setDeliveryLatLng([pos.lat, pos.lng]);
          setManualDistanceEnabled(false);
          
          try {


            // Fallback to Nominatim
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`);
            const data = await res.json();
            if (data) {
              const formatted = formatAddress(data);
              setCallForm(f => ({ ...f, delivery: formatted }));
            }
          } catch (err) {
            console.error("Marker drag geocode error:", err);
          }
        }
      });

      if (storeLat && storeLng) {
        const lineCoords = routeCoords.length > 0
          ? routeCoords
          : [[storeLat, storeLng] as [number, number], deliveryLatLng];

        const profileColors: Record<RouteProfile, string> = {
          driving: "hsl(var(--primary))",
          cycling: "#22c55e",
          walking: "#f59e0b",
        };

        routeLineRef.current = L.polyline(lineCoords, {
          color: routeCoords.length > 0 ? profileColors[routeProfile] : "#94a3b8",
          weight: routeCoords.length > 0 ? 5 : 3,
          dashArray: routeCoords.length > 0 ? undefined : "8 4",
          opacity: 0.85,
        }).addTo(map);

        const bounds = routeLineRef.current.getBounds();
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [deliveryLatLng, storeLat, storeLng, routeCoords, routeProfile]);

  // Driver markers + nearest
  const [nearestDriverInfo, setNearestDriverInfo] = useState<{
    distanceKm: number;
    etaMinutes: number;
    speedKmh: number;
  } | null>(null);
  const proximityAlertRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    driverMarkersRef.current.forEach(m => map.removeLayer(m));
    driverMarkersRef.current = [];

    let nearest: typeof nearestDriverInfo = null;

    driverLocations.forEach((d: any) => {
      const speedKmh = d.speed ? Math.round(d.speed * 3.6) : 0;
      const marker = L.marker([d.latitude, d.longitude], { icon: driverMapIcon })
        .addTo(map)
        .bindPopup(`<b>🚴 Entregador</b><br/>${speedKmh > 0 ? `${speedKmh} km/h` : "Parado"}`);
      driverMarkersRef.current.push(marker);

      if (storeLat && storeLng) {
        const dist = haversineKm(storeLat, storeLng, d.latitude, d.longitude);
        const avgSpeed = speedKmh > 3 ? speedKmh : 25;
        const eta = (dist / avgSpeed) * 60;
        if (!nearest || dist < nearest.distanceKm) {
          nearest = { distanceKm: dist, etaMinutes: eta, speedKmh };
        }
      }
    });

    setNearestDriverInfo(nearest);

    if (nearest && nearest.distanceKm <= 0.5 && !proximityAlertRef.current) {
      proximityAlertRef.current = true;
      toast.info("🚴 Entregador está a menos de 500m!", { duration: 5000 });
    } else if (!nearest || nearest.distanceKm > 0.5) {
      proximityAlertRef.current = false;
    }
  }, [driverLocations, storeLat, storeLng]);

  const handleDeliveryAddressChange = (value: string) => {
    setCallForm(f => ({ ...f, delivery: value }));
    setManualDistanceEnabled(false);
    geocodeDeliveryAddress(value);
    if (value.trim().length < 5) {
      setShowSuggestions(false);
    }
  };

  const handleCallDriver = async () => {
    if (!callForm.pickup.trim() || !callForm.delivery.trim()) {
      toast.error("Preencha endereço de coleta e entrega");
      return;
    }

    let finalDistance = distanceKm;
    let finalLatLng = deliveryLatLng;

    // If no coordinates yet, try to use the first suggestion if available
    if (!finalLatLng && addressSuggestions.length > 0) {
      const first = addressSuggestions[0];
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      finalLatLng = [lat, lng];
      setDeliveryLatLng(finalLatLng);
      
      // Re-calculate distance with the new coordinates
      if (storeLat && storeLng) {
        finalDistance = haversineKm(storeLat, storeLng, lat, lng);
      }
    }

    if (finalDistance <= 0 || !finalLatLng) {
      toast.error("Localização de entrega não definida. Selecione um endereço da lista ou clique no mapa.");
      return;
    }

    setCalling(true);
    try {
      const { data: requestId, error } = await supabase.rpc("deduct_credits_for_delivery", {
        p_pickup_address: callForm.pickup,
        p_delivery_address: callForm.delivery,
        p_notes: callForm.notes || null,
        p_restaurant_id: restaurant?.id || null,
        p_distance_km: finalDistance,
        p_preferred_driver_id: selectedDriverId || null,
      } as any);

      if (error) throw error;

      // Play a confirmation sound for the store owner
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
          osc.start();
          osc.stop(ctx.currentTime + 0.2);
        }
      } catch (e) {}

      toast.success(`Entregador chamado! Custo: R$ ${deliveryCost.toFixed(2)}`);
      
      const pickupAddr = restaurant?.address || callForm.pickup;
      setCallForm({ pickup: pickupAddr, delivery: "", notes: "" });
      setDeliveryLatLng(null);
      setRoadDistanceKm(0);
      setRoadDurationMin(0);
      setRouteCoords([]);
      setManualDistanceEnabled(false);
      setManualDistanceKm("");
      
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      console.error("Call driver error:", err);
      toast.error(err.message || "Erro ao chamar entregador. Verifique seus créditos.");
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* GPS Status Bar */}
      {gpsStatus === "granted" && gpsAccuracy !== null && (
        <Card className={`border ${gpsAccuracy <= 15 ? "border-green-500/40 bg-green-500/5" : gpsAccuracy <= 50 ? "border-yellow-500/40 bg-yellow-500/5" : "border-orange-500/40 bg-orange-500/5"}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <Navigation className={`w-4 h-4 ${gpsAccuracy <= 15 ? "text-green-500" : gpsAccuracy <= 50 ? "text-yellow-500" : "text-orange-500"}`} />
            <div className="flex-1">
              <p className="text-xs font-medium">
                📍 Localização ativa — Precisão: {Math.round(gpsAccuracy)}m
                {gpsAccuracy <= 15 ? " (Excelente)" : gpsAccuracy <= 50 ? " (Boa)" : " (Baixa)"}
              </p>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={requestGPS}>
              <RotateCcw className="w-3 h-3 mr-1" /> Atualizar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* GPS Permission — only when not granted */}
      {gpsStatus !== "granted" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Navigation className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Permitir localização</p>
              <p className="text-xs text-muted-foreground">
                Ative o GPS para localizar sua loja automaticamente
              </p>
            </div>
            <Button size="sm" onClick={requestGPS} disabled={gpsStatus === "requesting"}>
              {gpsStatus === "requesting" ? "Obtendo..." : "Permitir GPS"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Map */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Mapa de Entrega
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const types: (keyof typeof MAP_LAYERS)[] = ["streets", "satellite"];
                const next = types[(types.indexOf(mapType) + 1) % types.length];
                setMapType(next);
              }}
              className="gap-1 text-xs h-7"
            >
              <Layers className="w-3 h-3" />
              {mapType === "streets" ? "Mapa" : "Satélite"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div ref={containerRef} style={{ width: "100%", height: 320, borderRadius: 8 }} className="border border-border" />
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">🔴 Sua loja</span>
            <span className="flex items-center gap-1">🟢 Ponto de entrega</span>
            <span className="flex items-center gap-1">🔵 Entregadores</span>
          </div>

          {/* Route Profile Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1">Modo:</span>
            {(Object.keys(PROFILE_CONFIG) as RouteProfile[]).map((p) => {
              const config = PROFILE_CONFIG[p];
              const Icon = config.icon;
              const active = routeProfile === p;
              return (
                <Button
                  key={p}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={`h-8 gap-1.5 text-xs ${active ? "" : "text-muted-foreground"}`}
                  onClick={() => setRouteProfile(p)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </Button>
              );
            })}
          </div>

          {/* Route summary when route exists */}
          {distanceKm > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <Route className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-sm font-bold">{distanceKm.toFixed(1)} km</p>
                <p className="text-[10px] text-muted-foreground">
                  {distanceSource === "osrm" ? "Por rota" : distanceSource === "manual" ? "Manual" : "Aprox."}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <Clock className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-sm font-bold">
                  {roadDurationMin > 0 ? `~${Math.round(roadDurationMin)} min` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Tempo estimado</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <DollarSign className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-sm font-bold">R$ {deliveryCost.toFixed(2).replace(".", ",")}</p>
                <p className="text-[10px] text-muted-foreground">Custo total</p>
              </div>
            </div>
          )}

          {loadingRoute && (
            <p className="text-xs text-muted-foreground animate-pulse text-center">🔄 Calculando rota...</p>
          )}
        </CardContent>
      </Card>

      {/* Real-time nearest driver info */}
      {nearestDriverInfo && activeRequest && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Entregador mais próximo</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-background rounded-lg p-2">
                <p className="text-lg font-bold text-primary">
                  {nearestDriverInfo.distanceKm < 1
                    ? `${Math.round(nearestDriverInfo.distanceKm * 1000)}m`
                    : `${nearestDriverInfo.distanceKm.toFixed(1)}km`}
                </p>
                <p className="text-[10px] text-muted-foreground">Distância</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-lg font-bold text-primary">
                  {nearestDriverInfo.etaMinutes < 1
                    ? "<1 min"
                    : `${Math.round(nearestDriverInfo.etaMinutes)} min`}
                </p>
                <p className="text-[10px] text-muted-foreground">ETA</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-lg font-bold text-primary">
                  {nearestDriverInfo.speedKmh > 0 ? `${nearestDriverInfo.speedKmh} km/h` : "Parado"}
                </p>
                <p className="text-[10px] text-muted-foreground">Velocidade</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4" /> Chamar Entregador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Auto-detected pickup address (read-only) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-green-500" />
              Endereço de coleta (automático)
            </Label>
            <div className="flex gap-2">
              <Input
                value={callForm.pickup}
                readOnly
                placeholder={gpsStatus === "requesting" ? "Buscando localização..." : "Aguardando GPS..."}
                className="flex-1 bg-muted/30 cursor-default"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={requestGPS}
                title="Atualizar localização"
              >
                <Navigation className="w-4 h-4" />
              </Button>
            </div>
            {callForm.pickup && (
              <p className="text-[10px] text-green-600 dark:text-green-400">✓ Localização detectada automaticamente</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Endereço de entrega *</Label>
            <div className="relative" ref={suggestionsRef}>
              <Input
                value={callForm.delivery}
                onChange={(e) => handleDeliveryAddressChange(e.target.value)}
                onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Digite o endereço do cliente..."
              />
              {searchingAddress && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Search className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {/* Autocomplete dropdown */}
              {showSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {addressSuggestions.map((item: any, idx: number) => {
                    const formatted = formatAddress(item);
                    const dist = storeLat && storeLng
                      ? haversineKm(storeLat, storeLng, parseFloat(item.lat), parseFloat(item.lon))
                      : null;
                    return (
                      <button
                        key={idx}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/80 border-b border-border/30 last:border-b-0 transition-colors"
                        onClick={() => selectSuggestion(item)}
                      >
                        <p className="text-sm font-medium leading-tight">{formatted}</p>
                        {dist !== null && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            📍 ~{dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`} da loja
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                📍 Digite o endereço, selecione uma sugestão, ou clique/arraste no mapa
              </p>
              {deliveryLatLng && user?.id && (
                <ReportLocationButton
                  latitude={deliveryLatLng[0]}
                  longitude={deliveryLatLng[1]}
                  address={callForm.delivery}
                  userId={user.id}
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={callForm.notes} onChange={(e) => setCallForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Detalhes da entrega..." />
          </div>

          {/* Manual distance adjustment */}
          {distanceKm > 0 && (
            <div className="space-y-2">
              {!manualDistanceEnabled ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-muted-foreground"
                  onClick={() => {
                    setManualDistanceEnabled(true);
                    setManualDistanceKm(autoDistanceKm.toFixed(1));
                  }}
                >
                  <Pencil className="w-3 h-3" />
                  Ajustar distância manualmente
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Distância (km):</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={manualDistanceKm}
                    onChange={(e) => setManualDistanceKm(e.target.value)}
                    className="w-24 h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => {
                      setManualDistanceEnabled(false);
                      setManualDistanceKm("");
                    }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Usar automático
                  </Button>
                </div>
              )}
            </div>
          )}

          {distanceKm > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 border border-accent">
              <DollarSign className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Valor da corrida: <span className="text-primary">R$ {deliveryCost.toFixed(2).replace(".", ",")}</span></p>
                <p className="text-xs text-muted-foreground">
                  Taxa fixa R$ {baseFee.toFixed(2).replace(".", ",")} + {distanceKm.toFixed(1)} km × R$ {feePerKm.toFixed(2).replace(".", ",")} = R$ {(feePerKm * distanceKm).toFixed(2).replace(".", ",")}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Route className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {distanceSource === "osrm" && `Distância por rota (${PROFILE_CONFIG[routeProfile].label}) • ETA: ~${Math.round(roadDurationMin)} min`}
                    {distanceSource === "manual" && "Distância ajustada manualmente"}
                    {distanceSource === "haversine" && "Distância em linha reta (aproximada)"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {distanceKm <= 0 && !loadingRoute && (
            <p className="text-xs text-muted-foreground text-center py-2">
              📍 Digite o endereço de entrega ou clique no mapa para calcular o valor automaticamente
            </p>
          )}

          {/* Preferred Driver Selection */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-yellow-500" />
              Direcionar para entregador específico (Opcional)
            </Label>
            <div className="grid grid-cols-1 gap-2">
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={selectedDriverId || ""}
                onChange={(e) => setSelectedDriverId(e.target.value || null)}
              >
                <option value="">Qualquer entregador disponível</option>
                <optgroup label="Seus Favoritos Online">
                  {favoriteDrivers.filter((f: any) => driverLocations.some((dl: any) => dl.driver_id === f.driver_id)).map((f: any) => (
                    <option key={f.driver_id} value={f.driver_id}>
                      ⭐ {f.driver?.full_name} ({f.driver?.driver_code})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Outros Entregadores Online">
                  {driverLocations
                    .filter((dl: any) => !favoriteDrivers.some((f: any) => f.driver_id === dl.driver_id))
                    .map((dl: any) => (
                      <option key={dl.driver_id} value={dl.driver_id}>
                        {dl.driver?.full_name || "Entregador"} ({dl.driver?.driver_code || "N/A"})
                      </option>
                    ))}
                </optgroup>
              </select>
              {selectedDriverId && (
                <p className="text-[10px] text-primary font-medium">
                  Solicitação será enviada prioritariamente para este entregador.
                </p>
              )}
            </div>
          </div>

          <Button onClick={handleCallDriver} disabled={calling || distanceKm <= 0 || loadingRoute} className="w-full">
            {calling ? "Chamando..." : loadingRoute ? "Calculando rota..." : distanceKm > 0 ? `📲 Chamar Entregador (R$ ${deliveryCost.toFixed(2).replace(".", ",")})` : "📲 Defina o ponto de entrega"}
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
