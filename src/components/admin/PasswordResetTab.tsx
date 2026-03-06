import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { KeyRound, ShieldAlert, History, AlertTriangle } from "lucide-react";
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

const PasswordResetTab = () => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["password-reset-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("password_reset_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const handleReset = async () => {
    if (!password) {
      toast.error("Digite sua senha para confirmar sua identidade.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-passwords", {
        body: { admin_password: password },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success(
        `Redefinição concluída! ${data.success_count} e-mails enviados com sucesso.` +
        (data.failure_count > 0 ? ` ${data.failure_count} falhas.` : "")
      );
      setPassword("");
      setShowConfirm(false);
      refetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Erro ao redefinir senhas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Redefinir Senha de Todos os Usuários
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">Ação irreversível</p>
              <p className="text-muted-foreground">
                Todos os usuários receberão um e-mail de redefinição de senha e precisarão criar uma nova senha para acessar o sistema. Sua própria conta não será afetada.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Confirme sua identidade
            </label>
            <Input
              type="password"
              placeholder="Digite sua senha de administrador"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
                disabled={!password || loading}
              >
                {loading ? "Processando..." : "Redefinir Senhas de Todos os Usuários"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação enviará um e-mail de redefinição de senha para <strong>todos os usuários</strong> do sistema. Eles precisarão criar uma nova senha para continuar acessando.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleReset}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Confirmar Redefinição
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Histórico de Redefinições
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Sucesso</TableHead>
                <TableHead>Falhas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.action === "bulk_reset" ? "Redefinição em massa" : log.action}
                  </TableCell>
                  <TableCell>{log.total_users}</TableCell>
                  <TableCell className="text-green-600">{log.success_count}</TableCell>
                  <TableCell className="text-destructive">{log.failure_count}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Nenhuma redefinição registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PasswordResetTab;
