import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import DeleteConfirm from "./DeleteConfirm";

const DriversTab = () => {
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<{ id: string; userId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("delete-user", {
        body: { user_id: deleteId.userId },
      });
      if (res.error) throw res.error;
      toast.success(`${deleteId.name} removido!`);
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      setDeleteId(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Motoristas Ativos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.full_name}</TableCell>
                  <TableCell>{d.phone}</TableCell>
                  <TableCell className="capitalize">{d.vehicle_type}</TableCell>
                  <TableCell>{d.vehicle_plate || "—"}</TableCell>
                  <TableCell>{d.zone_description || `${d.zone_radius_km || 5}km`}</TableCell>
                  <TableCell>
                    <Badge variant={d.is_active ? "default" : "secondary"}>
                      {d.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId({ id: d.id, userId: d.user_id, name: d.full_name })}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {drivers.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum motorista cadastrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <DeleteConfirm open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title={deleteId?.name || "motorista"} loading={deleting} />
    </>
  );
};

export default DriversTab;
