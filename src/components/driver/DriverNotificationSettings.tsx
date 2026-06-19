import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Volume2, Vibrate, Bell, BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  setNotificationVolume,
  getNotificationVolume,
  playNotificationSound,
  playUrgentNotification,
  playStandbyAlert,
  startStandbyMode,
  stopStandbyMode,
  isStandbyActive,
  setStandbyInterval,
  getStandbyInterval,
  setStandbyGate,
} from "@/lib/notificationSound";

const STORAGE_KEY = "driver-notification-settings";

interface NotificationSettings {
  volume: number;
  standbyEnabled: boolean;
  standbyIntervalMs: number;
}

const loadSettings = (): NotificationSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { volume: 1.0, standbyEnabled: false, standbyIntervalMs: 30000 };
};

const saveSettings = (settings: NotificationSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
};

const DriverNotificationSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);
  const pendingCountRef = useRef(0);
  const [pendingCount, setPendingCount] = useState(0);

  // Apply settings on mount
  useEffect(() => {
    setNotificationVolume(settings.volume);
    setStandbyInterval(settings.standbyIntervalMs);
    // Gate standby alerts to only fire when there are pending deliveries to do.
    setStandbyGate(() => pendingCountRef.current > 0);
    if (settings.standbyEnabled) {
      startStandbyMode(settings.standbyIntervalMs);
    }
    return () => {
      stopStandbyMode();
      setStandbyGate(null);
    };
  }, []);

  // Track count of pending (unassigned) delivery requests in realtime.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const refresh = async () => {
      const { count } = await supabase
        .from("delivery_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("driver_id", null);
      if (cancelled) return;
      const n = count ?? 0;
      pendingCountRef.current = n;
      setPendingCount(n);
    };

    refresh();
    const channel = supabase
      .channel("driver-standby-pending")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_requests" },
        () => refresh()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const updateSettings = useCallback((partial: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      saveSettings(next);

      // Apply immediately
      if (partial.volume !== undefined) setNotificationVolume(partial.volume);
      if (partial.standbyIntervalMs !== undefined) setStandbyInterval(partial.standbyIntervalMs);
      if (partial.standbyEnabled !== undefined) {
        if (partial.standbyEnabled) {
          startStandbyMode(next.standbyIntervalMs);
        } else {
          stopStandbyMode();
        }
      }

      return next;
    });
  }, []);

  const intervalOptions = [
    { value: "15000", label: "15 segundos" },
    { value: "30000", label: "30 segundos" },
    { value: "60000", label: "1 minuto" },
    { value: "120000", label: "2 minutos" },
    { value: "300000", label: "5 minutos" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Volume2 className="w-4 h-4" /> Configurações de Alerta
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Volume Control */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Volume do Alerta</Label>
            <Badge variant="secondary" className="text-xs">
              {Math.round(settings.volume * 100)}%
            </Badge>
          </div>
          <Slider
            value={[settings.volume * 100]}
            onValueChange={([v]) => updateSettings({ volume: v / 100 })}
            min={10}
            max={100}
            step={5}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => playNotificationSound()}
              className="flex-1 text-xs"
            >
              🔔 Testar Normal
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => playUrgentNotification()}
              className="flex-1 text-xs"
            >
              🚨 Testar Urgente
            </Button>
          </div>
        </div>

        {/* Standby Mode */}
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {settings.standbyEnabled ? (
                <Bell className="w-4 h-4 text-primary" />
              ) : (
                <BellOff className="w-4 h-4 text-muted-foreground" />
              )}
              <div>
                <Label className="text-sm">Alerta em Standby</Label>
                <p className="text-xs text-muted-foreground">
                  Toca periodicamente apenas quando há entregas pendentes para aceitar
                  {settings.standbyEnabled && (
                    <> · <span className="font-medium text-foreground">{pendingCount}</span> pendente(s) agora</>
                  )}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.standbyEnabled}
              onCheckedChange={(checked) => updateSettings({ standbyEnabled: checked })}
            />
          </div>

          {settings.standbyEnabled && (
            <div className="space-y-2 pl-6">
              <Label className="text-xs">Intervalo do alerta</Label>
              <Select
                value={String(settings.standbyIntervalMs)}
                onValueChange={(v) => updateSettings({ standbyIntervalMs: Number(v) })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervalOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => playStandbyAlert()}
                className="w-full text-xs"
              >
                🔕 Testar Alerta Standby
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          <Vibrate className="w-3 h-3 inline mr-1" />
          Vibração ativa automaticamente em dispositivos compatíveis
        </p>
      </CardContent>
    </Card>
  );
};

export default DriverNotificationSettings;
