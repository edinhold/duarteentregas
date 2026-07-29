import { Bell, BellOff, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/** Driver-facing card that explains and controls background push status. */
const PushStatusCard = () => {
  const push = usePushNotifications();
  const [busy, setBusy] = useState(false);

  const active = push.permission === "granted" && push.optedIn && Boolean(push.subscriptionId);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const result = await push.enable();
      if (result === "granted") toast.success("Notificações ativadas neste aparelho.");
      else if (result === "denied")
        toast.warning("Permissão bloqueada. Libere as notificações nas configurações do aparelho.");
      else if (result === "unsupported")
        toast.error("Este navegador não suporta notificações. Instale o aplicativo.");
      else toast.info("Permissão não concedida.");
    } finally {
      setBusy(false);
    }
  };

  const handleResync = async () => {
    setBusy(true);
    try {
      const ok = await push.resync();
      toast[ok ? "success" : "warning"](
        ok ? "Cadastro do aparelho atualizado." : "Não foi possível atualizar agora.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {active ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
          Notificações de novas entregas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={active ? "default" : "secondary"}>
            {active ? "Ativas" : push.permission === "denied" ? "Bloqueadas" : "Inativas"}
          </Badge>
          <Badge variant="outline">{push.platform}</Badge>
          {push.subscriptionId && (
            <Badge variant="outline">ID …{push.subscriptionId.slice(-8)}</Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {active
            ? "Você receberá o aviso mesmo com o aplicativo fechado ou o celular bloqueado."
            : "Ative para receber chamadas de entrega em segundo plano, com som e vibração."}
        </p>

        {push.permission === "denied" && (
          <p className="text-xs text-destructive">
            A permissão foi negada. Abra as configurações do aparelho, permita notificações para este
            aplicativo e toque em atualizar.
          </p>
        )}

        <div className="flex gap-2">
          {!active && (
            <Button onClick={handleEnable} disabled={busy} className="flex-1">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4 mr-1" />}
              Ativar notificações
            </Button>
          )}
          <Button variant="outline" onClick={handleResync} disabled={busy} className={active ? "flex-1" : ""}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Atualizar
          </Button>
        </div>

        {active && push.lastSyncedAt && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-primary" />
            Sincronizado em {new Date(push.lastSyncedAt).toLocaleString("pt-BR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PushStatusCard;
