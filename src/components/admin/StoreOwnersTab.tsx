import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";

const StoreOwnersTab = () => {
  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-store-owners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").not("owner_id", "is", null).order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lojistas Ativos</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Restaurante</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {restaurants.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.category_name}</TableCell>
                <TableCell>{r.address || "—"}</TableCell>
                <TableCell>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${r.is_open ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                    {r.is_open ? "Aberto" : "Fechado"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {restaurants.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum lojista cadastrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default StoreOwnersTab;
