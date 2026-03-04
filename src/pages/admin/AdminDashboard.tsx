import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/hooks/useData";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store, Package, ShoppingCart, TrendingUp, ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import RestaurantForm from "@/components/admin/RestaurantForm";
import ProductForm from "@/components/admin/ProductForm";
import DeleteConfirm from "@/components/admin/DeleteConfirm";

const statusOptions = [
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "preparing", label: "Em preparo" },
  { value: "delivering", label: "A caminho" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();

  // Restaurant state
  const [restaurantFormOpen, setRestaurantFormOpen] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState<any>(null);
  const [deleteRestaurant, setDeleteRestaurant] = useState<any>(null);
  const [deletingRestaurant, setDeletingRestaurant] = useState(false);

  // Product state
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deleteProduct, setDeleteProduct] = useState<any>(null);
  const [deletingProduct, setDeletingProduct] = useState(false);

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
      const { data, error } = await supabase.from("orders").select("*, restaurants(name)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const handleDeleteRestaurant = async () => {
    if (!deleteRestaurant) return;
    setDeletingRestaurant(true);
    try {
      const { error } = await supabase.from("restaurants").delete().eq("id", deleteRestaurant.id);
      if (error) throw error;
      toast.success("Restaurante excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
      queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      setDeleteRestaurant(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeletingRestaurant(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteProduct) return;
    setDeletingProduct(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", deleteProduct.id);
      if (error) throw error;
      toast.success("Produto excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDeleteProduct(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeletingProduct(false);
    }
  };

  const handleOrderStatus = async (orderId: string, status: string) => {
    try {
      const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
      if (error) throw error;
      toast.success("Status atualizado!");
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    }
  };

  const stats = [
    { label: "Restaurantes", value: restaurants.length, icon: Store, color: "text-primary" },
    { label: "Produtos", value: products.length, icon: Package, color: "text-secondary" },
    { label: "Pedidos", value: orders.length, icon: ShoppingCart, color: "text-accent" },
    { label: "Faturamento", value: `R$ ${orders.reduce((s: number, o: any) => s + Number(o.total), 0).toFixed(0)}`, icon: TrendingUp, color: "text-primary" },
  ];

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
                <Button size="sm" className="rounded-lg" onClick={() => { setEditingRestaurant(null); setRestaurantFormOpen(true); }}>+ Novo</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Avaliação</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
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
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingRestaurant(r); setRestaurantFormOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteRestaurant(r)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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
                <Button size="sm" className="rounded-lg" onClick={() => { setEditingProduct(null); setProductFormOpen(true); }}>+ Novo</Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Restaurante</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.restaurants?.name}</TableCell>
                        <TableCell>R$ {Number(p.price).toFixed(2)}</TableCell>
                        <TableCell>{p.category}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingProduct(p); setProductFormOpen(true); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteProduct(p)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
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
                      <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-sm">#{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">{order.restaurants?.name}</p>
                          <p className="font-bold text-sm mt-1">R$ {Number(order.total).toFixed(2)}</p>
                        </div>
                        <Select value={order.status} onValueChange={(v) => handleOrderStatus(order.id, v)}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <RestaurantForm open={restaurantFormOpen} onOpenChange={setRestaurantFormOpen} restaurant={editingRestaurant} categories={categories} />
      <ProductForm open={productFormOpen} onOpenChange={setProductFormOpen} product={editingProduct} restaurants={restaurants} />
      <DeleteConfirm open={!!deleteRestaurant} onOpenChange={(o) => !o && setDeleteRestaurant(null)} onConfirm={handleDeleteRestaurant} title={deleteRestaurant?.name || "restaurante"} loading={deletingRestaurant} />
      <DeleteConfirm open={!!deleteProduct} onOpenChange={(o) => !o && setDeleteProduct(null)} onConfirm={handleDeleteProduct} title={deleteProduct?.name || "produto"} loading={deletingProduct} />
    </div>
  );
};

export default AdminDashboard;
