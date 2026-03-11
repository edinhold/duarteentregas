import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, UserCog, Users, Search } from "lucide-react";
import DeleteConfirm from "./DeleteConfirm";

const CustomersTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteCustomer, setDeleteCustomer] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [promoteCustomer, setPromoteCustomer] = useState<any>(null);
  const [promoting, setPromoting] = useState(false);
  const [driverForm, setDriverForm] = useState({
    vehicleType: "moto",
    vehiclePlate: "",
    pixKey: "",
    pixKeyType: "cpf",
  });

  // Fetch all profiles (customers)
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Get existing driver user_ids to flag them
      const { data: drivers } = await supabase.from("drivers").select("user_id");
      const driverUserIds = new Set((drivers || []).map((d: any) => d.user_id));

      // Get user roles
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const roleMap: Record<string, string[]> = {};
      (roles || []).forEach((r: any) => {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });

      return (data || []).map((p: any) => ({
        ...p,
        isDriver: driverUserIds.has(p.user_id),
        roles: roleMap[p.user_id] || [],
      }));
    },
  });

  const filtered = customers.filter((c: any) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (c.full_name || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q)
    );
  });

  const handleDelete = async () => {
    if (!deleteCustomer) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: deleteCustomer.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Cliente excluído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      setDeleteCustomer(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir cliente");
    } finally {
      setDeleting(false);
    }
  };

  const handlePromote = async () => {
    if (!promoteCustomer) return;
    setPromoting(true);
    try {
      // Create driver record
      const { error: driverError } = await supabase.from("drivers").insert({
        user_id: promoteCustomer.user_id,
        full_name: promoteCustomer.full_name || "Sem nome",
        phone: promoteCustomer.phone || "",
        vehicle_type: driverForm.vehicleType,
        vehicle_plate: driverForm.vehiclePlate || null,
        pix_key: driverForm.pixKey || null,
        pix_key_type: driverForm.pixKeyType || null,
      });
      if (driverError) throw driverError;

      // Assign driver role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: promoteCustomer.user_id,
        role: "driver" as any,
      });
      if (roleError) throw roleError;

      toast.success(`${promoteCustomer.full_name} promovido a motorista!`);
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      setPromoteCustomer(null);
      setDriverForm({ vehicleType: "moto", vehiclePlate: "", pixKey: "", pixKeyType: "cpf" });
    } catch (err: any) {
      toast.error(err.message || "Erro ao promover cliente");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Clientes Cadastrados ({filtered.length})
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Funções</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.full_name || "—"}</TableCell>
                    <TableCell>{c.phone || "—"}</TableCell>
                    <TableCell>{c.city || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {c.roles.length === 0 && (
                          <span className="text-xs text-muted-foreground">Cliente</span>
                        )}
                        {c.roles.map((r: string) => (
                          <span key={r} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {r === "admin" ? "Admin" : r === "driver" ? "Motorista" : r === "store_owner" ? "Lojista" : r}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!c.isDriver && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => setPromoteCustomer(c)}
                          >
                            <UserCog className="w-3.5 h-3.5 mr-1" />
                            Motorista
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteCustomer(c)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      Nenhum cliente encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <DeleteConfirm
        open={!!deleteCustomer}
        onOpenChange={(o) => !o && setDeleteCustomer(null)}
        onConfirm={handleDelete}
        title={deleteCustomer?.full_name || "cliente"}
        loading={deleting}
      />

      {/* Promote to driver dialog */}
      <Dialog open={!!promoteCustomer} onOpenChange={(o) => !o && setPromoteCustomer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promover para Motorista</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Completar cadastro de <strong>{promoteCustomer?.full_name}</strong> como motorista:
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Veículo</label>
              <Select value={driverForm.vehicleType} onValueChange={(v) => setDriverForm(f => ({ ...f, vehicleType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="moto">Moto</SelectItem>
                  <SelectItem value="carro">Carro</SelectItem>
                  <SelectItem value="bicicleta">Bicicleta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Placa do Veículo</label>
              <Input
                placeholder="ABC-1234"
                value={driverForm.vehiclePlate}
                onChange={(e) => setDriverForm(f => ({ ...f, vehiclePlate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo da Chave PIX</label>
              <Select value={driverForm.pixKeyType} onValueChange={(v) => setDriverForm(f => ({ ...f, pixKeyType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="aleatoria">Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Chave PIX</label>
              <Input
                placeholder="Digite a chave PIX"
                value={driverForm.pixKey}
                onChange={(e) => setDriverForm(f => ({ ...f, pixKey: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteCustomer(null)}>Cancelar</Button>
            <Button onClick={handlePromote} disabled={promoting}>
              {promoting ? "Promovendo..." : "Promover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomersTab;
