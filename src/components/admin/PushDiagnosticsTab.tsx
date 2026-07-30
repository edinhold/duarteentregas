import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  Smartphone,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DriverRow {
  user_id: string;
  full_name: string;
  driver_code: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  approval_status: string;
  devices: number;
  active_devices: number;
  platforms: string[];
  last_subscription_at: string | null;
  eligible: boolean;
  reason: string;
}

interface DiagnosticsData {
  configured: boolean;
  app_id_masked: string | null;
  missing_secrets: string[];
  android_channel_id: string;
  totals: {
    drivers: number;
    approved: number;
    with_device: number;
    ready: number;
    online: number;
  };
  drivers: DriverRow[];
  recommendations: string[];
}

interface LogRow {
  id: string;
  created_at: string;
  event_type: string;
  response_status: number | null;
  error_code: string | null;
  recipients_count: number | null;
  onesignal_notification_id: string | null;
  platform: string | null;
}

/** Extracts the JSON message an edge function returned with a non-2xx status. */
async function readFunctionError(error: any): Promise<string> {
  let message = error?.message ?? "Falha desconhecida";
  try {
    const response = error?.context as Response | undefined;
    if (response && typeof response.clone === "function") {
      const raw = await response.clone().text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          message = parsed.error || parsed.message || message;
        } catch {
          message = raw.slice(0, 300);
        }
      }
    }
  } catch (parseError) {
    console.error("[PushDiagnostics:parse-error]", parseError);
  }
  return message;
}

/** Admin push health, driver readiness table and manual test sender. */
const PushDiagnosticsTab = () => {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [target, setTarget] = useState<string>("__all__");
  const [lastResult, setLastResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [diag, logRes] = await Promise.all([
        supabase.functions.invoke("push-diagnostics", { body: {} }),
        supabase
          .from("notification_delivery_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      if (diag.error) throw new Error(await readFunctionError(diag.error));
      setData(diag.data as DiagnosticsData);
      setLogs((logRes.data as any) ?? []);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      console.error("[PushDiagnostics:load-error]", message);
      setLoadError(message);
      toast.error(`Falha ao carregar diagnóstico: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const readyDrivers = useMemo(
    () => (data?.drivers ?? []).filter((d) => d.eligible),
    [data],
  );

  const sendTest = async () => {
    setSending(true);
    setLastResult(null);
    try {
      const body =
        target === "__all__"
          ? { target: "all_drivers" }
          : { target: "driver", user_id: target };
      const { data: res, error } = await supabase.functions.invoke("push-test", { body });
      if (error) throw new Error(await readFunctionError(error));
      setLastResult(res);
      if (res?.ok) {
        toast.success(
          `Enviado para ${res.recipients ?? 0} aparelho(s). Confirme a chegada no dispositivo.`,
        );
      } else {
        toast.error(res?.message ?? "Nenhum aparelho recebeu a notificação.");
      }
      void load();
    } catch (err: any) {
      toast.error(`Falha ao enviar: ${err?.message ?? err}`);
    } finally {
      setSending(false);
    }
  };


  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando diagnóstico…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4" /> Notificações push
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {data && !data.configured && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Configuração incompleta no servidor: {data.missing_secrets.join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Entregadores" value={data?.totals.drivers ?? 0} />
        <Stat label="Aprovados" value={data?.totals.approved ?? 0} />
        <Stat label="Com aparelho" value={data?.totals.with_device ?? 0} />
        <Stat label="Prontos" value={data?.totals.ready ?? 0} highlight />
        <Stat label="Online agora" value={data?.totals.online ?? 0} />
      </div>

      {data?.recommendations?.length ? (
        <Alert>
          <Activity className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-1">
              {data.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="test">
        <TabsList>
          <TabsTrigger value="test">Enviar teste</TabsTrigger>
          <TabsTrigger value="drivers">Entregadores</TabsTrigger>
          <TabsTrigger value="logs">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="test" className="space-y-3 pt-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Teste de notificação push</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Destinatário</label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">
                      Todos os entregadores prontos ({readyDrivers.length})
                    </SelectItem>
                    {(data?.drivers ?? []).map((d) => (
                      <SelectItem key={d.user_id} value={d.user_id}>
                        {d.full_name}
                        {d.driver_code ? ` · ${d.driver_code}` : ""}
                        {d.eligible ? "" : " (sem aparelho ativo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Mensagem"
              />
              <Button onClick={sendTest} disabled={sending} className="w-full">
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Enviar notificação de teste
              </Button>

              {lastResult && (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <p className="flex items-center gap-1 font-medium">
                    {lastResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    {lastResult.message}
                  </p>
                  <p className="text-muted-foreground">
                    Aparelhos alvo: {lastResult.recipients ?? 0} · Código: {lastResult.code}
                  </p>
                  {lastResult.onesignal_notification_id && (
                    <p className="text-xs text-muted-foreground break-all">
                      ID OneSignal: {lastResult.onesignal_notification_id}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A entrega final depende das configurações do aparelho (canal, som, bateria).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drivers" className="pt-3">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entregador</TableHead>
                  <TableHead>Aparelhos</TableHead>
                  <TableHead>Plataformas</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.drivers ?? []).map((d) => (
                  <TableRow key={d.user_id}>
                    <TableCell>
                      <p className="font-medium">{d.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.driver_code ?? "—"} ·{" "}
                        {d.is_online ? "online" : "offline"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm">
                        <Smartphone className="w-3 h-3" />
                        {d.active_devices}/{d.devices}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.platforms.length ? d.platforms.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.eligible ? "default" : "secondary"}>{d.reason}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!data?.drivers.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Nenhum entregador cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="pt-3">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Aparelhos</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs">{l.event_type}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          l.status === "sent"
                            ? "default"
                            : l.status === "skipped"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{l.recipients_count ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                      {l.error_message ?? l.onesignal_notification_id ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!logs.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhum envio registrado ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Stat = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) => (
  <Card>
    <CardContent className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </CardContent>
  </Card>
);

export default PushDiagnosticsTab;
