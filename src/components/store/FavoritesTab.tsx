import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Star, UserPlus, Trash2, Search, Code, User } from "lucide-react";

interface FavoritesTabProps {
  restaurant: any;
}

const FavoritesTab = ({ restaurant }: FavoritesTabProps) => {
  const queryClient = useQueryClient();
  const [driverCode, setDriverCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ["favorite-drivers", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const { data, error } = await supabase
        .from("store_driver_favorites")
        .select(`
          id,
          driver_id,
          driver:drivers(id, user_id, full_name, driver_code, phone)
        `)
        .eq("restaurant_id", restaurant.id);
      
      if (error) {
        console.error("Error fetching favorites:", error);
        return [];
      }
      return data;
    },
    enabled: !!restaurant?.id,
  });

  const handleAddFavorite = async () => {
    if (!driverCode.trim()) {
      toast.error("Digite o código ou nome do motorista");
      return;
    }

    setAdding(true);
    try {
      // 1. Search for driver by code or name
      const { data: drivers, error: searchError } = await supabase
        .from("drivers")
        .select("id, full_name, driver_code")
        .or(`driver_code.eq.${driverCode.trim()},full_name.ilike.%${driverCode.trim()}%`)
        .limit(1);

      if (searchError) throw searchError;
      if (!drivers || drivers.length === 0) {
        toast.error("Motorista não encontrado com este código ou nome");
        return;
      }

      const driver = drivers[0];

      // 2. Check if already favorite
      const isAlreadyFavorite = favorites.some((f: any) => f.driver_id === driver.id);
      if (isAlreadyFavorite) {
        toast.info("Este motorista já está nos seus favoritos");
        return;
      }

      // 3. Add to favorites
      const { error: insertError } = await supabase
        .from("store_driver_favorites")
        .insert({
          restaurant_id: restaurant.id,
          driver_id: driver.id
        });

      if (insertError) throw insertError;

      toast.success(`${driver.full_name} adicionado aos favoritos!`);
      setDriverCode("");
      queryClient.invalidateQueries({ queryKey: ["favorite-drivers", restaurant.id] });
    } catch (err: any) {
      console.error("Error adding favorite:", err);
      toast.error("Erro ao adicionar favorito");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveFavorite = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("store_driver_favorites")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success(`${name} removido dos favoritos`);
      queryClient.invalidateQueries({ queryKey: ["favorite-drivers", restaurant.id] });
    } catch (err: any) {
      console.error("Error removing favorite:", err);
      toast.error("Erro ao remover favorito");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Adicionar Entregador Favorito
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="driver-search">Nome ou Código do Entregador</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="driver-search"
                  placeholder="Ex: ABC123 ou João Silva"
                  value={driverCode}
                  onChange={(e) => setDriverCode(e.target.value)}
                  className="pl-9"
                  onKeyDown={(e) => e.key === "Enter" && handleAddFavorite()}
                />
              </div>
              <Button onClick={handleAddFavorite} disabled={adding}>
                {adding ? "Adicionando..." : "Adicionar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode encontrar o código no perfil do motorista ou pesquisar pelo nome completo.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            Seus Entregadores Favoritos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center animate-pulse text-muted-foreground">Carregando seus favoritos...</div>
          ) : favorites.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="bg-muted w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <Star className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhum entregador favorito adicionado.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {favorites.map((fav: any) => (
                <div 
                  key={fav.id} 
                  className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {fav.driver?.full_name?.charAt(0) || <User className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{fav.driver?.full_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] py-0 h-4 gap-1">
                          <Code className="w-2.5 h-2.5" />
                          {fav.driver?.driver_code || "Sem código"}
                        </Badge>
                        {fav.driver?.phone && (
                          <span className="text-[10px] text-muted-foreground">{fav.driver.phone}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveFavorite(fav.id, fav.driver?.full_name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FavoritesTab;
