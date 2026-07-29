import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Settings2,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { openAppSettings } from "@/lib/push";

const PLATFORM_LABEL: Record<string, string> = {
  android_apk: "Aplicativo Android",
  web_pwa: "Aplicativo web (PWA)",
  ios: "iPhone / iPad",
};

/** Driver-facing notification status + device guidance. */
const PushStatusCard = () => {
  const push = usePushNotifications();
  const [working, setWorking] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const granted = push.permission === "granted";
  const denied = push.permission === "denied";
  const ready = granted && push.optedIn && Boolean(push.subscriptionId) && push.syncedToDatabase;

  const enable = async () => {
    setWorking(true);
    try {
      const permission = await push.enable();
      if (permission === "granted") toast.success("Notificações ativadas neste aparelho.");
      else if (permission === "denied") {
        toast.error("Permissão negada. Ative nas configurações do aparelho.");
      } else toast.info("Permissão ainda não concedida.");
    } finally {
      setWorking(false);
    }
  };

  const resync = async () => {
    setWorking(true);
    try {
      const ok = await push.resync();
      if (ok) toast.success("Inscrição sincronizada.");
      else toast.error("Não foi possível sincronizar. Ative as notificações primeiro.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4" /> Status das notificações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!push.supported && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Este navegador não suporta notificações. Use o aplicativo Android ou instale o
                atalho na tela inicial.
              </AlertDescription>
            </Alert>
          )}

          {denied && (
            <Alert variant="destructive">
              <BellOff className="h-4 w-4" />
              <AlertDescription>
                As notificações estão desativadas neste aparelho.
              </AlertDescription>
            </Alert>
          )}

          {push.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{push.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <Row label="Permissão">
              <Badge variant={granted ? "default" : denied ? "destructive" : "secondary"}>
                {granted ? "concedida" : denied ? "negada" : "pendente"}
              </Badge>
            </Row>
            <Row label="Inscrição">
              <Badge variant={push.optedIn ? "default" : "secondary"}>
                {push.optedIn ? "ativa" : "inativa"}
              </Badge>
            </Row>
            <Row label="Identificador">
              <span className="text-muted-foreground">
                {push.subscriptionId ? `…${push.subscriptionId.slice(-8)}` : "não gerado"}
              </span>
            </Row>
            <Row label="Plataforma">
              <span className="text-muted-foreground flex items-center gap-1">
                <Smartphone className="w-3 h-3" />
                {PLATFORM_LABEL[push.platform] ?? push.platform}
              </span>
            </Row>
            <Row label="Última sincronização">
              <span className="text-muted-foreground">
                {push.lastSyncedAt
                  ? new Date(push.lastSyncedAt).toLocaleString("pt-BR")
                  : "nunca"}
              </span>
            </Row>
            <Row label="Registrado no sistema">
              {push.syncedToDatabase ? (
                <span className="text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> sim
                </span>
              ) : (
                <span className="text-muted-foreground">não</span>
              )}
            </Row>
          </div>

          {ready && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Este aparelho está pronto para receber novas entregas. A exibição do alerta
                depende das configurações do próprio aparelho.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={enable} disabled={working || !push.supported} className="flex-1">
              {working ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Bell className="w-4 h-4 mr-1" />
              )}
              Ativar notificações
            </Button>
            <Button variant="outline" onClick={resync} disabled={working}>
              <RefreshCw className="w-4 h-4 mr-1" /> Sincronizar
            </Button>
            {push.runtime === "cordova" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!openAppSettings()) {
                    toast.info("Abra Configurações › Aplicativos › Notificações.");
                  }
                }}
              >
                <Settings2 className="w-4 h-4 mr-1" /> Configurações do aplicativo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Para receber novas entregas</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
            <li>Permita notificações para o aplicativo.</li>
            <li>Mantenha o canal “Novas entregas” ativado.</li>
            <li>Ative som e vibração desse canal.</li>
            <li>Permita a exibição de notificações na tela bloqueada.</li>
            <li>Desative a restrição severa de bateria para o aplicativo.</li>
            <li>Não force a parada do aplicativo.</li>
            <li>Mantenha internet móvel ou Wi-Fi disponível.</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-3">
            O Android pode reduzir o som ou adiar o alerta durante chamadas, no modo silencioso ou
            com “Não perturbe” ativo. Mesmo assim a entrega continua aparecendo no painel.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-0.5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <div className="text-sm">{children}</div>
  </div>
);

export default PushStatusCard;
