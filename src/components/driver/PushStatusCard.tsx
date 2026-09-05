import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bell, BellOff, Loader2, Smartphone, Trash2, ShieldCheck } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

const TIPS = [
  "Permitir notificações para o aplicativo",
  "Manter o canal “Novas entregas” ativado com som e vibração",
  "Mostrar notificações na tela bloqueada",
  "Permitir execução em segundo plano",
  "Remover a restrição severa de bateria",
  "Não forçar a parada do aplicativo",
  "Manter a internet ativa",
];

const PushStatusCard = ({ userId }: { userId?: string | null }) => {
  const { state, loading, activate, remove } = usePushNotifications(userId, "driver");
  const [deleting, setDeleting] = useState(false);

  const granted = state?.permission === "granted" && !!state?.subscriptionId;

  const handleActivate = async () => {
    console.log("[DeviceRegistration:action]", { action: "manual_activate", userId });
    const s = await activate();
    if (s?.permission === "granted" && s.subscriptionId) toast.success("Notificações ativadas neste aparelho!");
    else if (s?.permission === "denied") toast.error("Permissão negada. Libere as notificações nas configurações do aparelho.");
    else toast.info("Não foi possível concluir a inscrição. Tente novamente.");
  };

  const handleDeleteDevice = async () => {
    if (!state?.subscriptionId) return;
    setDeleting(true);
    console.log("[DeviceRegistration:action]", { action: "confirm_delete_device", subscriptionId: state.subscriptionId });
    const ok = await remove(state.subscriptionId);
    setDeleting(false);
    if (ok) {
      toast.success("Dispositivo removido com sucesso. Este aparelho não receberá mais notificações.");
    } else {
      toast.error("Erro ao remover dispositivo.");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {granted ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
          Notificações & Dispositivo Ativo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={granted ? "default" : "secondary"}>{granted ? "Ativo" : "Inativo"}</Badge>
          <Badge variant="outline" className="gap-1">
            <Smartphone className="w-3 h-3" />
            {state?.platform === "android_apk" ? "Aplicativo Android" : state?.platform === "ios" ? "iOS" : "Navegador / PWA"}
          </Badge>
          {state?.subscriptionId && (
            <Badge variant="outline">ID ***{state.subscriptionId.slice(-8)}</Badge>
          )}
        </div>

        {granted ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Aparelho cadastrado exclusivamente para a sua conta.</span>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deleting || loading}>
                  {deleting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-2" />}
                  Excluir este dispositivo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover este dispositivo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ao remover o dispositivo, este aparelho deixará de receber notificações de novas entregas imediatamente. Você poderá reativá-lo mais tarde.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteDevice} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    Confirmar remoção
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <Button onClick={handleActivate} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
            Ativar notificações neste aparelho
          </Button>
        )}

        <div className="text-xs text-muted-foreground space-y-1 pt-1">
          <p className="font-medium text-foreground">Configuração recomendada do aparelho:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {TIPS.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p className="pt-1 text-[11px]">
            O som e a vibração funcionam em segundo plano e tela bloqueada, respeitando as permissões do sistema.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PushStatusCard;
