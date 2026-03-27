import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface GPSPosition {
  lat: number;
  lng: number;
}

interface KalmanState {
  lat: number;
  lng: number;
  varLat: number;
  varLng: number;
  speed: number;
  timestamp: number;
}

interface GPSTrackingOptions {
  userId?: string;
  saveIntervalMoving?: number;
  saveIntervalStationary?: number;
  maxAcceptableAccuracy?: number;
  outlierThresholdKmh?: number;
  stationarySpeedThreshold?: number;
}

// Haversine distance in meters
const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isValidCoord = (lat: number, lng: number): boolean =>
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && lat !== 0 && lng !== 0;

export const useGPSTracking = (options: GPSTrackingOptions = {}) => {
  const {
    userId,
    saveIntervalMoving = 2000,
    saveIntervalStationary = 15000,
    maxAcceptableAccuracy = 150,       // raised from 100 — urban areas often 100-150m
    outlierThresholdKmh = 200,
    stationarySpeedThreshold = 0.2,    // lowered from 0.5 — ~0.7 km/h, only truly stopped
  } = options;

  const [position, setPosition] = useState<GPSPosition | null>(null);
  const [accuracy, setAccuracy] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [watching, setWatching] = useState(false);
  const [gpsQuality, setGpsQuality] = useState<"excellent" | "good" | "fair" | "poor">("poor");
  const [sampleCount, setSampleCount] = useState(0);
  const [isStationary, setIsStationary] = useState(false);
  const [totalDistance, setTotalDistance] = useState(0); // cumulative meters

  const watchIdRef = useRef<number | null>(null);
  const lastSavedRef = useRef(0);
  const kalmanRef = useRef<KalmanState | null>(null);
  const historyRef = useRef<Array<{ lat: number; lng: number; acc: number; ts: number }>>([]);
  const discardedCountRef = useRef(0);
  const stationaryCountRef = useRef(0);
  const lastMovingPosRef = useRef<GPSPosition | null>(null);
  const lastAcceptedPosRef = useRef<GPSPosition | null>(null);
  const totalDistanceRef = useRef(0);

  const classifyQuality = useCallback((acc: number) => {
    if (acc <= 5) return "excellent";
    if (acc <= 15) return "good";
    if (acc <= 40) return "fair";
    return "poor";
  }, []);

  // ---------- Adaptive Kalman Filter ----------
  // Key fix: reduce over-smoothing by using speed-adaptive gain
  const applyKalman = useCallback(
    (lat: number, lng: number, acc: number, ts: number, rawSpeed: number | null): GPSPosition => {
      const speedMs = rawSpeed && rawSpeed > 0 ? rawSpeed : 1.4;
      const speedDeg = speedMs / 111_320;
      const dt = kalmanRef.current ? (ts - kalmanRef.current.timestamp) / 1000 : 1;
      // Higher process noise when moving fast = trust measurements more
      const processNoise = speedDeg * speedDeg * dt * (speedMs > 2 ? 2.0 : 1.0);

      if (!kalmanRef.current) {
        kalmanRef.current = {
          lat, lng,
          varLat: acc * acc * 0.0000001,
          varLng: acc * acc * 0.0000001,
          speed: speedMs,
          timestamp: ts,
        };
        return { lat, lng };
      }

      const k = kalmanRef.current;
      k.varLat += processNoise;
      k.varLng += processNoise;

      const measNoise = (acc / 111_320) ** 2;
      const gainLat = k.varLat / (k.varLat + measNoise);
      const gainLng = k.varLng / (k.varLng + measNoise);

      k.lat += gainLat * (lat - k.lat);
      k.lng += gainLng * (lng - k.lng);
      k.varLat *= 1 - gainLat;
      k.varLng *= 1 - gainLng;
      k.speed = speedMs;
      k.timestamp = ts;

      return { lat: k.lat, lng: k.lng };
    },
    []
  );

  // ---------- Outlier detection ----------
  const isOutlier = useCallback(
    (lat: number, lng: number, ts: number): boolean => {
      const history = historyRef.current;
      if (history.length === 0) return false;

      const last = history[history.length - 1];
      const dist = haversineM(last.lat, last.lng, lat, lng);
      const dtSec = (ts - last.ts) / 1000;
      if (dtSec <= 0) return false;

      const speedKmh = (dist / dtSec) * 3.6;
      return speedKmh > outlierThresholdKmh;
    },
    [outlierThresholdKmh]
  );

  // ---------- Weighted average (reduced influence) ----------
  const weightedAverage = useCallback((samples: typeof historyRef.current): GPSPosition | null => {
    if (samples.length === 0) return null;
    if (samples.length === 1) return { lat: samples[0].lat, lng: samples[0].lng };

    let totalWeight = 0;
    let wLat = 0;
    let wLng = 0;

    for (const s of samples) {
      const w = 1 / Math.max(s.acc, 1);
      wLat += s.lat * w;
      wLng += s.lng * w;
      totalWeight += w;
    }

    return { lat: wLat / totalWeight, lng: wLng / totalWeight };
  }, []);

  // ---------- Save to DB ----------
  const savePositionToDb = useCallback(
    async (lat: number, lng: number, acc: number, hdg: number | null, spd: number | null, stationary: boolean) => {
      if (!userId) return;
      const now = Date.now();
      const interval = stationary ? saveIntervalStationary : saveIntervalMoving;
      if (now - lastSavedRef.current < interval) return;
      lastSavedRef.current = now;

      try {
        await (supabase as any).from("driver_locations").upsert(
          {
            user_id: userId,
            driver_id: userId,
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            heading: hdg,
            speed: spd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      } catch (e) {
        console.error("Erro ao salvar posição:", e);
      }
    },
    [userId, saveIntervalMoving, saveIntervalStationary]
  );

  // ---------- Process raw GPS reading ----------
  const processReading = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy: acc, heading: hdg, speed: spd } = pos.coords;
      const ts = pos.timestamp || Date.now();

      // 1. Validate coordinates
      if (!isValidCoord(latitude, longitude)) {
        discardedCountRef.current++;
        return;
      }

      // 2. Discard very poor accuracy
      if (acc > maxAcceptableAccuracy) {
        discardedCountRef.current++;
        return;
      }

      // 3. Outlier rejection
      if (isOutlier(latitude, longitude, ts)) {
        discardedCountRef.current++;
        return;
      }

      // 3. Add to sliding window (keep last 5 samples)
      historyRef.current.push({ lat: latitude, lng: longitude, acc, ts });
      if (historyRef.current.length > 5) historyRef.current.shift();

      // 5. Apply Kalman filter
      const kalmanPos = applyKalman(latitude, longitude, acc, ts, spd);

      // 6. Reduced blending — only 15% weighted avg (was 30%) to preserve real path
      const recentSamples = historyRef.current.filter((s) => ts - s.ts < 8_000);
      let finalPos = kalmanPos;

      if (recentSamples.length >= 3) {
        const weighted = weightedAverage(recentSamples);
        if (weighted) {
          finalPos = {
            lat: kalmanPos.lat * 0.85 + weighted.lat * 0.15,
            lng: kalmanPos.lng * 0.85 + weighted.lng * 0.15,
          };
        }
      }

      // 7. Detect stationary state
      const currentSpeed = spd ?? 0;
      const stationary = currentSpeed < stationarySpeedThreshold;

      if (stationary) {
        stationaryCountRef.current++;
        // Only lock after 10 consecutive stationary readings (was 5)
        if (stationaryCountRef.current >= 10 && lastMovingPosRef.current) {
          finalPos = lastMovingPosRef.current;
        }
      } else {
        stationaryCountRef.current = 0;
        lastMovingPosRef.current = finalPos;
      }

      // 8. Accumulate distance — only when actually moving and accuracy is reasonable
      if (lastAcceptedPosRef.current && !stationary && acc <= 80) {
        const segmentM = haversineM(
          lastAcceptedPosRef.current.lat,
          lastAcceptedPosRef.current.lng,
          finalPos.lat,
          finalPos.lng
        );
        // Only count segments > 1m (noise filter) and < 500m (anti-teleport)
        if (segmentM > 1 && segmentM < 500) {
          totalDistanceRef.current += segmentM;
          setTotalDistance(totalDistanceRef.current);
        }
      }
      lastAcceptedPosRef.current = finalPos;

      setIsStationary(stationary);
      setSampleCount((c) => c + 1);
      setPosition(finalPos);
      setAccuracy(acc);
      setHeading(hdg);
      setSpeed(spd);
      setGpsQuality(classifyQuality(acc));
      setWatching(true);

      savePositionToDb(finalPos.lat, finalPos.lng, acc, hdg, spd, stationary);
    },
    [applyKalman, isOutlier, weightedAverage, classifyQuality, savePositionToDb, maxAcceptableAccuracy, stationarySpeedThreshold]
  );

  // ---------- Start / Stop ----------
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("GPS não suportado neste dispositivo");
      return;
    }

    kalmanRef.current = null;
    historyRef.current = [];
    discardedCountRef.current = 0;
    stationaryCountRef.current = 0;
    lastMovingPosRef.current = null;
    lastAcceptedPosRef.current = null;
    totalDistanceRef.current = 0;
    setTotalDistance(0);
    setSampleCount(0);

    const id = navigator.geolocation.watchPosition(
      processReading,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Permissão de localização negada.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error("Localização indisponível. Verifique se o GPS está ativado.");
        } else {
          toast.error("Erro ao obter localização");
        }
        setWatching(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 500,    // reduced from 1000 — fresher data
        timeout: 10000,     // increased from 8000 — more tolerance
      }
    );

    watchIdRef.current = id;
  }, [processReading]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setWatching(false);
    }
  }, []);

  // Auto-start on mount
  useEffect(() => {
    startTracking();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    position,
    accuracy,
    heading,
    speed,
    watching,
    gpsQuality,
    sampleCount,
    isStationary,
    totalDistance,
    discardedCount: discardedCountRef.current,
    startTracking,
    stopTracking,
  };
};
