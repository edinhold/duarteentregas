import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, Bell } from "lucide-react";
import { toast } from "sonner";

const getFunctionErrorMessage = (error: unknown) => {
  const anyError = error as any;
  const context = anyError?.context;
  const response = context?.response;
  const body = context?.body ?? context?.json;
  const backendMessage = body?.error
    ?? body?.details?.errors?.join?.("; ")
    ?? anyError?.message;
  const status = response?.status ?? body?.status;
  return status ? `${backendMessage} (HTTP ${status})` : (backendMessage ?? String(error));
};

interface DriverRow {
  user_id: string;
  full_name: string | null;
  is_online: boolean;
  is_active: boolean;
  last_seen_at: string | null;
}

const TestPush = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driverId, setDriverId] = useState<string>("");
  const [fee, setFee] = useState("8.50");
  const [pickup, setPickup] = useState("Loja Teste, Primavera do Leste - MT");
  const [delivery, setDelivery] = useState("Rua Exemplo, 123 - Primavera do Leste - MT");
  const [broadcast, setBroadcast] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const runDiagnostic = async () => {
    if (!driverId) { toast.error("Selecione um motorista"); return; }
    setDiagnosing(true);
    setDiagnostic(null);
    try {
      const { data, error } = await supabase.functions.invoke("onesignal-user-status", {
        body: { external_id: driverId },
      });
      if (error) {
        const msg = getFunctionErrorMessage(error);
        setDiagnostic({ error: msg, raw: error });
        toast.error("Falha no diagnóstico: " + msg);
        return;
      }
      setDiagnostic(data);
      if ((data as any)?.android_active) {
        toast.success("Android inscrito e habilitado ✓");
      } else if ((data as any)?.any_active) {
        toast.warning("Inscrito, mas nenhum aparelho Android ativo");
      } else {
        toast.error("Nenhuma inscrição ativa para este motorista");
      }
    } finally {
      setDiagnosing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login", { replace: true }); return; }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: session.user.id, _role: "admin",
      });
      if (!isAdmin) { toast.error("Acesso negado"); navigate("/admin/login", { replace: true }); return; }
      setAuthChecked(true);
      const { data, error } = await supabase
        .from("drivers")
        .select("user_id,full_name,is_online,is_active,last_seen_at")
        .order("is_online", { ascending: false })
        .order("full_name", { ascending: true });
      if (error) { toast.error("Erro ao listar motoristas: " + error.message); return; }
      setDrivers(data ?? []);
    };
    init();
  }, [navigate]);

  const sendTest = async () => {
    setSending(true);
    setLastResult(null);
    try {
      const fakeRequestId = (globalThis.crypto?.randomUUID?.() ?? `test-${Date.now()}`);
      const payload: Record<string, unknown> = {
        request_id: fakeRequestId,
        driver_fee: Number(fee) || 0,
        pickup_address: pickup,
        delivery_address: delivery,
      };
      if (!broadcast) {
        if (!driverId) { toast.error("Selecione um motorista ou marque broadcast"); setSending(false); return; }
        payload.driver_id = driverId;
      }
      const { data, error } = await supabase.functions.invoke("send-onesignal-delivery", {
        body: payload,
      });
      if (error) {
        const message = getFunctionErrorMessage(error);
        setLastResult({ error: message, raw: error });
        throw new Error(message);
      }
      setLastResult(data);
      if ((data as any)?.sent > 0) {
        toast.success(`Push enviado para ${(data as any).sent} motorista(s)`);
      } else {
        toast.warning(`Nenhum push enviado (${(data as any)?.reason ?? "ver detalhes"})`);
      }
    } catch (e: any) {
      toast.error("Falha ao enviar: " + (e?.message ?? String(e)));
      setLastResult((current: any) => current ?? { error: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" /> Teste de Notificação Push
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Disparar notificação de teste</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                id="broadcast"
                type="checkbox"
                checked={broadcast}
                onChange={(e) => setBroadcast(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="broadcast" className="cursor-pointer">
                Enviar para todos os motoristas online (broadcast)
              </Label>
            </div>

            {!broadcast && (
              <div className="space-y-2">
                <Label>Motorista</Label>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um motorista" /></SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.user_id} value={d.user_id}>
                        {d.is_online ? "🟢 " : "⚪ "}
                        {d.full_name ?? "(sem nome)"} {d.is_active ? "" : "• inativo"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {drivers.length} motoristas cadastrados ({drivers.filter(d => d.is_online).length} online)
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Taxa (R$)</Label>
                <Input value={fee} onChange={(e) => setFee(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Endereço de coleta</Label>
                <Input value={pickup} onChange={(e) => setPickup(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Endereço de entrega</Label>
              <Input value={delivery} onChange={(e) => setDelivery(e.target.value)} />
            </div>

            <Button onClick={sendTest} disabled={sending} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Enviando..." : "Enviar notificação de teste"}
            </Button>

            {lastResult && (
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Como validar canal / som / vibração</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>Primeiro plano (app aberto):</strong> o overlay interno aparece com som e vibração via Web Audio + Vibration API.</p>
            <p><strong>Segundo plano (tela bloqueada / outro app):</strong> a notificação OneSignal chega no canal de alta importância — som padrão e padrão de vibração (0, 400, 200, 400 ms). No iOS é enviada como <code>time_sensitive</code> para aparecer na tela de bloqueio mesmo em Foco.</p>
            <p><strong>Dica:</strong> faça o motorista logar no app móvel/web, conceder permissão de notificação, depois minimize ou bloqueie a tela e dispare o teste daqui.</p>
            <p>O <code>request_id</code> é aleatório a cada disparo, então a trava de idempotência <em>(pedido, motorista)</em> nunca bloqueia o teste.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TestPush;
