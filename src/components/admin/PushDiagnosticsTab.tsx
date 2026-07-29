import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Loader2, RefreshCw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { chamarNotificacao } from "@/lib/push/notify";

/** Admin diagnostics + test sender for the push notification system. */
const PushDiagnosticsTab = () => {
  const [target, setTarget] = useState<string>("all_drivers");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const { data: subscriptions, refetch, isFetching } = useQuery({
    queryKey: ["push-subscriptions-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, user_id, profile_type, platform, device_type, permission_status, subscription_status, active, last_seen_at, onesignal_subscription_id")
        .order("last_seen_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: logs, refetch: refetchLogs } = useQuery({
    queryKey: ["notification-delivery-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_delivery_logs")
        .select("id, pedido_id, event_type, recipients_count, response_status, error_code, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const driverSubs = (subscriptions ?? []).filter((s: any) => s.profile_type === "driver");

  const sendTest = async () => {
    setSending(true);
    setLastResult(null);
    try {
      const subId =
        target === "all_drivers"
          ? undefined
          : driverSubs.find((s: any) => s.user_id === target)?.onesignal_subscription_id;

      const data = await chamarNotificacao({
        test_mode: true,
        ...(subId ? { test_subscription_id: subId } : {}),
      });
      setLastResult(data);
      toast.success(`Enviado para ${data.recipients ?? 0} dispositivo(s).`);
      refetchLogs();
    } catch (err: any) {
      setLastResult({ error: err?.message ?? String(err) });
      toast.error(`Falha ao enviar: ${err?.message ?? err}`);
      refetchLogs();
    } finally {
      setSending(false);
    }
  };


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4" /> Teste de notificação push
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_drivers">Todos os motoristas inscritos</SelectItem>
              {driverSubs.map((s: any) => (
                <SelectItem key={s.id} value={s.user_id}>
                  {s.platform} · …{String(s.onesignal_subscription_id).slice(-8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={sendTest} disabled={sending} className="w-full">
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
            Enviar teste
          </Button>

          {lastResult && (
            <pre className="text-xs bg-muted rounded-md p-2 overflow-auto max-h-52">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Dispositivos inscritos ({subscriptions?.length ?? 0})</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {(subscriptions ?? []).map((s: any) => (
                <div key={s.id} className="text-xs border rounded-md p-2 space-y-1">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={s.active ? "default" : "secondary"}>{s.active ? "ativo" : "inativo"}</Badge>
                    <Badge variant="outline">{s.profile_type}</Badge>
                    <Badge variant="outline">{s.platform}</Badge>
                    <Badge variant="outline">{s.permission_status}</Badge>
                  </div>
                  <p className="text-muted-foreground break-all">
                    …{String(s.onesignal_subscription_id).slice(-12)} ·{" "}
                    {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString("pt-BR") : "sem registro"}
                  </p>
                </div>
              ))}
              {(subscriptions ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum dispositivo inscrito ainda.</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimos envios</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-56">
            <div className="space-y-2">
              {(logs ?? []).map((l: any) => (
                <div key={l.id} className="text-xs border rounded-md p-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={l.error_code ? "destructive" : "default"}>{l.error_code ?? "ok"}</Badge>
                    <Badge variant="outline">{l.event_type}</Badge>
                    <span className="text-muted-foreground">{l.recipients_count} destinatário(s)</span>
                  </div>
                  <p className="text-muted-foreground mt-1">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                    {l.response_status ? ` · HTTP ${l.response_status}` : ""}
                  </p>
                </div>
              ))}
              {(logs ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum envio registrado.</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default PushDiagnosticsTab;
