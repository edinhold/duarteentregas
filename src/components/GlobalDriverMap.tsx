import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import { useAllDriversStatus, DriverStatus } from "@/hooks/useAllDriversStatus";
import provider from "@/services/maps/mapProvider";
import { Button } from "./ui/button";
import { Layers, Navigation } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import MapErrorBoundary from "./MapErrorBoundary";

const statusColor = (status: DriverStatus) => {
  if (status === "available") return "#22c55e";
  if (status === "in_delivery") return "#ef4444";
  return "#94a3b8";
};

const statusLabel = (status: DriverStatus) =>
  status === "available" ? "Disponível" : status === "in_delivery" ? "Em Entrega" : "Inativo";

const GlobalDriverMapContent = () => {
  const { data: drivers = [], isLoading } = useAllDriversStatus();
  const mapRef = useRef<MLMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, { marker: MLMarker; status: DriverStatus }>>(new Map());
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = provider.initializeMap({ container: containerRef.current, zoom: 11 });
    mapRef.current = map;
    map.on("load", () => setReady(true));
    return () => {
      markersRef.current.clear();
      provider.destroy(mapRef.current);
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Camada satélite (Esri, open data) sobre o estilo OSM
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = "satellite-layer";
    if (satellite) {
      if (!map.getSource(id)) {
        map.addSource(id, {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          attribution: "&copy; Esri",
        });
        map.addLayer({ id, type: "raster", source: id });
      }
    } else if (map.getLayer(id)) {
      map.removeLayer(id);
      map.removeSource(id);
    }
  }, [satellite, ready]);

  const positioned = useMemo(
    () => drivers.filter((d) => d.latitude && d.longitude),
    [drivers]
  );

  // Marcadores
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const seen = new Set<string>();
    positioned.forEach((driver) => {
      seen.add(driver.id);
      const html = `
        <div class="p-1">
          <p class="font-bold text-sm">${driver.full_name}</p>
          <p class="text-xs">Código: ${driver.driver_code}</p>
          <p class="text-xs mt-1">Status: <strong>${statusLabel(driver.status)}</strong></p>
        </div>`;
      const existing = markersRef.current.get(driver.id);
      if (existing && existing.status === driver.status) {
        existing.marker.setLngLat([driver.longitude!, driver.latitude!]);
        existing.marker.getPopup()?.setHTML(html);
      } else {
        existing?.marker.remove();
        const marker = provider.createMarker(
          map,
          { lat: driver.latitude!, lng: driver.longitude! },
          { color: statusColor(driver.status), popupHtml: html }
        );
        markersRef.current.set(driver.id, { marker, status: driver.status });
      }
    });

    markersRef.current.forEach((entry, id) => {
      if (!seen.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    });

    if (!fittedRef.current && positioned.length > 0) {
      fittedRef.current = true;
      provider.fitBounds(
        map,
        positioned.map((d) => ({ lat: d.latitude!, lng: d.longitude! }))
      );
    }
  }, [positioned, ready]);

  return (
    <div className="relative w-full h-[400px] sm:h-[600px] rounded-xl overflow-hidden border">
      <div ref={containerRef} className="w-full h-full z-0" />

      <div className="absolute top-3 left-3 z-[400] flex flex-col gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="bg-background/90 shadow-md backdrop-blur-sm"
          onClick={() => setSatellite((s) => !s)}
        >
          <Layers className="w-4 h-4 mr-2" />
          {satellite ? "Mapa" : "Satélite"}
        </Button>
      </div>

      <div className="absolute bottom-3 left-3 z-[400] flex flex-col gap-2 pointer-events-none">
        <Card className="bg-background/90 shadow-md backdrop-blur-sm border-none pointer-events-auto">
          <CardContent className="p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
              <span className="text-xs font-medium">Disponível</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
              <span className="text-xs font-medium">Em Entrega</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#94a3b8]" />
              <span className="text-xs font-medium">Inativo / Desativado</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {(isLoading || !ready) && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-[500]">
          <div className="flex flex-col items-center gap-2">
            <Navigation className="w-8 h-8 animate-bounce text-primary" />
            <p className="text-sm font-medium">Carregando mapa...</p>
          </div>
        </div>
      )}

      {!isLoading && ready && positioned.length === 0 && (
        <div className="absolute inset-x-0 top-3 flex justify-center z-[450] pointer-events-none">
          <span className="text-xs font-medium bg-background/90 px-3 py-1 rounded-full shadow">
            Nenhum motorista com localização ativa
          </span>
        </div>
      )}
    </div>
  );
};

const GlobalDriverMap = () => (
  <MapErrorBoundary fallbackHeight="500px">
    <GlobalDriverMapContent />
  </MapErrorBoundary>
);

export default GlobalDriverMap;
