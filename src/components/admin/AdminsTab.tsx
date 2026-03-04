import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { ShieldCheck, UserPlus, Trash2 } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().trim().email("E-mail inválido").max(255);

const AdminsTab = () => {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // Get all admin roles with profile info
  const { data: admins = [] } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("role", "admin");
      if (error) throw error;
      
      // Get profiles for each admin
      const enriched = await Promise.all(
        data.map(async (role: any) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("user_id", role.user_id)
            .maybeSingle();
          return { ...role, full_name: profile?.full_name || "—", phone: profile?.phone || "—" };
        })
      );
      return enriched;
    },
  });

  const handleAdd = async () => {
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("assign-admin-role", {
        body: { email: result.data },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success("Administrador adicionado com sucesso!");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar administrador");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (roleId: string, userId: string) => {
    // Prevent removing yourself
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id === userId) {
      toast.error("Você não pode remover a si mesmo como administrador");
      return;
    }

    setRemoving(roleId);
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);
      if (error) throw error;
      toast.success("Administrador removido");
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add new admin */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Adicionar Administrador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="E-mail do usuário cadastrado"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={loading || !email.trim()}>
              {loading ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            O usuário precisa já estar cadastrado na plataforma.
          </p>
        </CardContent>
      </Card>

      {/* Current admins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Administradores Atuais
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin: any) => (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">{admin.full_name}</TableCell>
                  <TableCell>{admin.phone}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{admin.user_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemove(admin.id, admin.user_id)}
                      disabled={removing === admin.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {admins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhum administrador encontrado
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

export default AdminsTab;
