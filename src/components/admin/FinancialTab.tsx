import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { DollarSign, CheckCircle, XCircle, Key, CalendarDays, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DeleteConfirm from "@/components/admin/DeleteConfirm";

const FinancialTab = () => {
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState<string | null>(null);
  const [savingPayDay, setSavingPayDay] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showDeleteSelected, setShowDeleteSelected] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedEarnings, setSelectedEarnings] = useState<Set<string>>(new Set());
  const [selectedWithdrawals, setSelectedWithdrawals] = useState<Set<string>>(new Set());

  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_config")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const handlePaymentDayChange = async (day: string) => {
    setSavingPayDay(true);
    try {
      const { error } = await supabase
        .from("delivery_config")
        .update({ payment_day: parseInt(day) } as any)
        .eq("id", deliveryConfig?.id || "");
      if (error) throw error;
      toast.success(`Dia de pagamento atualizado para dia ${day}`);
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSavingPayDay(false);
    }
  };

  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-drivers-financial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: earnings = [] } = useQuery({
    queryKey: ["admin-earnings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_earnings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: deliveredRequests = [] } = useQuery({
    queryKey: ["admin-delivered-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("driver_fee")
        .eq("status", "delivered");
      if (error) throw error;
      return data;
    },
  });

  const handleWithdrawalAction = async (id: string, status: "approved" | "rejected") => {
    setProcessing(id);
    try {
      const { error } = await supabase
        .from("withdrawal_requests")
        .update({ status, processed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(status === "approved" ? "Saque aprovado!" : "Saque rejeitado");
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally {
      setProcessing(null);
    }
  };

  const getDriverByUserId = (userId: string) => {
    return drivers.find((d: any) => d.user_id === userId);
  };

  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovado",
    rejected: "Rejeitado",
  };

  const pixTypeLabels: Record<string, string> = {
    cpf: "CPF",
    phone: "Telefone",
    email: "E-mail",
    random: "Aleatória",
  };

  const totalDriverEarnings = earnings.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const totalDriverFees = deliveredRequests.reduce((sum: number, r: any) => sum + Number(r.driver_fee || 0), 0);
  const appRevenue = Math.max(totalDriverFees - totalDriverEarnings, 0);
  const pendingWithdrawals = withdrawals.filter((w: any) => w.status === "pending");

  const totalSelected = selectedEarnings.size + selectedWithdrawals.size;

  const toggleEarning = (id: string) => {
    setSelectedEarnings(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleWithdrawal = (id: string) => {
    setSelectedWithdrawals(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllEarnings = () => {
    if (selectedEarnings.size === earnings.length) {
      setSelectedEarnings(new Set());
    } else {
      setSelectedEarnings(new Set(earnings.map((e: any) => e.id)));
    }
  };

  const toggleAllWithdrawals = () => {
    if (selectedWithdrawals.size === withdrawals.length) {
      setSelectedWithdrawals(new Set());
    } else {
      setSelectedWithdrawals(new Set(withdrawals.map((w: any) => w.id)));
    }
  };

  const handleDeleteSelected = async () => {
    setDeleting(true);
    try {
      const earningIds = Array.from(selectedEarnings);
      const withdrawalIds = Array.from(selectedWithdrawals);

      const promises: Promise<any>[] = [];
      if (earningIds.length > 0) {
        promises.push(supabase.from("driver_earnings").delete().in("id", earningIds).then());
      }
      if (withdrawalIds.length > 0) {
        promises.push(supabase.from("withdrawal_requests").delete().in("id", withdrawalIds).then());
      }

      const results = await Promise.all(promises);
      for (const r of results) {
        if (r.error) throw r.error;
      }

      toast.success(`${totalSelected} registro(s) excluído(s) com sucesso!`);
      setSelectedEarnings(new Set());
      setSelectedWithdrawals(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-earnings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-delivered-requests"] });
    } catch (err: any) {
      console.error("Erro ao apagar registros:", err);
      toast.error(err.message || "Erro ao apagar registros.");
    } finally {
      setDeleting(false);
      setShowDeleteSelected(false);
    }
  };

  const handleDeleteAllFinancial = async () => {
    setDeleting(true);
    try {
      const [c1, c2] = await Promise.all([
        supabase.from("driver_earnings").select("*", { count: "exact", head: true }),
        supabase.from("withdrawal_requests").select("*", { count: "exact", head: true }),
      ]);

      const totalRecords = (c1.count || 0) + (c2.count || 0);
      if (totalRecords === 0) {
        toast.info("Nenhum registro financeiro para apagar.");
        setDeleting(false);
        setShowDeleteAll(false);
        return;
      }

      const [r1, r2] = await Promise.all([
        supabase.from("driver_earnings").delete().gte("created_at", "1970-01-01T00:00:00Z"),
        supabase.from("withdrawal_requests").delete().gte("created_at", "1970-01-01T00:00:00Z"),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      toast.success(`${totalRecords} registro(s) financeiro(s) apagados com sucesso!`);
      setSelectedEarnings(new Set());
      setSelectedWithdrawals(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-earnings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-delivered-requests"] });
    } catch (err: any) {
      console.error("Erro ao apagar registros financeiros:", err);
      toast.error(err.message || "Erro ao apagar registros.");
    } finally {
      setDeleting(false);
      setShowDeleteAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {totalSelected > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteSelected(true)}>
            <Trash2 className="w-4 h-4 mr-1" /> Excluir Selecionados ({totalSelected})
          </Button>
        )}
        <Button variant="destructive" size="sm" onClick={() => setShowDeleteAll(true)}>
          <Trash2 className="w-4 h-4 mr-1" /> Apagar Tudo
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-green-600">R$ {appRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Faturamento do App</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-primary">R$ {totalDriverEarnings.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Pago aos Motoristas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-orange-500">{pendingWithdrawals.length}</p>
            <p className="text-xs text-muted-foreground">Saques Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold">{drivers.length}</p>
            <p className="text-xs text-muted-foreground">Motoristas</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Day Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Dia de Pagamento (sem taxa)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Defina o dia do mês em que os motoristas podem sacar sem cobrança de taxa de antecipação.
          </p>
          <div className="flex items-center gap-3">
            <Select
              value={String((deliveryConfig as any)?.payment_day ?? 15)}
              onValueChange={handlePaymentDayChange}
              disabled={savingPayDay}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Dia" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">
              Atual: Dia {(deliveryConfig as any)?.payment_day ?? 15}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal Requests with checkboxes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Solicitações de Saque
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Nenhuma solicitação de saque</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={withdrawals.length > 0 && selectedWithdrawals.size === withdrawals.length}
                      onCheckedChange={toggleAllWithdrawals}
                    />
                  </TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead>Líquido</TableHead>
                  <TableHead>PIX</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((w: any) => {
                  const driver = getDriverByUserId(w.driver_user_id);
                  return (
                    <TableRow key={w.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedWithdrawals.has(w.id)}
                          onCheckedChange={() => toggleWithdrawal(w.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{driver?.full_name || "—"}</TableCell>
                      <TableCell>R$ {Number(w.amount).toFixed(2)}</TableCell>
                      <TableCell>{w.fee_percent}% (R$ {Number(w.fee_amount).toFixed(2)})</TableCell>
                      <TableCell className="font-bold">R$ {Number(w.net_amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        {w.pix_key ? (
                          <span>{pixTypeLabels[w.pix_key_type] || w.pix_key_type}: {w.pix_key}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                          {statusLabels[w.status] || w.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {w.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600"
                              onClick={() => handleWithdrawalAction(w.id, "approved")}
                              disabled={processing === w.id}>
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                              onClick={() => handleWithdrawalAction(w.id, "rejected")}
                              disabled={processing === w.id}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Earnings with checkboxes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Ganhos dos Motoristas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {earnings.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">Nenhum ganho registrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={earnings.length > 0 && selectedEarnings.size === earnings.length}
                      onCheckedChange={toggleAllEarnings}
                    />
                  </TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map((e: any) => {
                  const driver = drivers.find((d: any) => d.id === e.driver_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedEarnings.has(e.id)}
                          onCheckedChange={() => toggleEarning(e.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{driver?.full_name || "—"}</TableCell>
                      <TableCell>R$ {Number(e.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={e.status === "paid" ? "default" : "secondary"}>
                          {e.status === "paid" ? "Pago" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drivers PIX Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" /> Chaves PIX dos Motoristas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Tipo PIX</TableHead>
                <TableHead>Chave PIX</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.full_name}</TableCell>
                  <TableCell>{d.phone}</TableCell>
                  <TableCell>{d.pix_key_type ? (pixTypeLabels[d.pix_key_type] || d.pix_key_type) : "—"}</TableCell>
                  <TableCell>{d.pix_key || <span className="text-muted-foreground">Não cadastrada</span>}</TableCell>
                  <TableCell>
                    <Badge variant={d.is_active ? "default" : "secondary"}>
                      {d.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DeleteConfirm
        open={showDeleteAll}
        onOpenChange={setShowDeleteAll}
        onConfirm={handleDeleteAllFinancial}
        title="todos os registros financeiros"
        loading={deleting}
      />
      <DeleteConfirm
        open={showDeleteSelected}
        onOpenChange={setShowDeleteSelected}
        onConfirm={handleDeleteSelected}
        title={`${totalSelected} registro(s) selecionado(s)`}
        loading={deleting}
      />
    </div>
  );
};

export default FinancialTab;
