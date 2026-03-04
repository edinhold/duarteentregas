import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Store, Package, ShoppingCart, TrendingUp, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AdminDashboard = () => {
  const navigate = useNavigate();

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, restaurants(name)").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, restaurants(name)").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });

  const stats = [
    { label: "Restaurantes", value: restaurants.length, icon: Store, color: "text-primary" },
    { label: "Produtos", value: products.length, icon: Package, color: "text-secondary" },
    { label: "Pedidos", value: orders.length, icon: ShoppingCart, color: "text-accent" },
    { label: "Faturamento", value: `R$ ${orders.reduce((s, o) => s + Number(o.total), 0).toFixed(0)}`, icon: TrendingUp, color: "text-primary" },
  ];

  const statusLabel: Record<string, string> = {
    pending: "Pendente", confirmed: "Confirmado", preparing: "Em preparo",
    delivering: "A caminho", delivered: "Entregue", cancelled: "Cancelado",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Painel Administrativo</h1>
      </header>

      <div className="p-4 max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-extrabold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="restaurants">
          <TabsList className="w-full">
            <TabsTrigger value="restaurants" className="flex-1">Restaurantes</TabsTrigger>
            <TabsTrigger value="products" className="flex-1">Produtos</TabsTrigger>
            <TabsTrigger value="orders" className="flex-1">Pedidos</TabsTrigger>
          </TabsList>

          <TabsContent value="restaurants">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Restaurantes</CardTitle>
                <Button size="sm" className="rounded-lg">+ Novo</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Avaliação</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {restaurants.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.category_name}</TableCell>
                        <TableCell>⭐ {r.rating}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${r.is_open ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                            {r.is_open ? "Aberto" : "Fechado"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Produtos</CardTitle>
                <Button size="sm" className="rounded-lg">+ Novo</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Restaurante</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Categoria</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.restaurants?.name}</TableCell>
                        <TableCell>R$ {Number(p.price).toFixed(2)}</TableCell>
                        <TableCell>{p.category}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pedidos Recentes</CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhum pedido ainda</p>
                ) : (
                  <div className="space-y-3">
                    {orders.map((order: any) => (
                      <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-bold text-sm">#{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">{order.restaurants?.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm">R$ {Number(order.total).toFixed(2)}</p>
                          <span className="text-xs font-semibold text-accent">{statusLabel[order.status] || order.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
