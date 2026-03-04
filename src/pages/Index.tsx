import { useState, useMemo } from "react";
import logoDuarte from "@/assets/logo-duarte.jpeg";
import { useNavigate } from "react-router-dom";
import { useCategories, useRestaurants } from "@/hooks/useData";
import { useAuth } from "@/contexts/AuthContext";
import CategoryBar from "@/components/CategoryBar";
import RestaurantCard from "@/components/RestaurantCard";
import RestaurantMap from "@/components/RestaurantMap";
import SearchBar from "@/components/SearchBar";
import CartFloatingBar from "@/components/CartFloatingBar";
import { Button } from "@/components/ui/button";
import { User, LogOut, Settings, Map, List, Download } from "lucide-react";
import { motion } from "framer-motion";
import { GOOGLE_MAPS_API_KEY } from "@/config/maps";
import logoDuarteFull from "@/assets/logo-duarte-full.jpeg";

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const hasMapsKey = GOOGLE_MAPS_API_KEY !== "YOUR_GOOGLE_MAPS_API_KEY";

  const { data: categories = [] } = useCategories();
  const { data: restaurants = [] } = useRestaurants();

  const filtered = useMemo(() => {
    let list = restaurants;
    if (selectedCategory) {
      list = list.filter((r) => r.category_id === selectedCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.category_name.toLowerCase().includes(q));
    }
    return list;
  }, [search, selectedCategory, restaurants]);

  const featured = restaurants.filter((r) => r.is_featured && r.is_open);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-primary text-primary-foreground px-4 pt-10 pb-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <img src={logoDuarte} alt="Duarte Delivery" className="h-10 object-contain" />
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button size="icon" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/20 rounded-full" onClick={() => navigate("/admin/login")}>
                  <Settings className="w-5 h-5" />
                </Button>
                <Button size="icon" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/20 rounded-full" onClick={signOut}>
                  <LogOut className="w-5 h-5" />
                </Button>
              </>
            ) : (
              <Button variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/20 rounded-full" onClick={() => navigate("/auth")}>
                <User className="w-5 h-5 mr-1" /> Entrar
              </Button>
            )}
          </div>
        </div>
        <SearchBar value={search} onChange={setSearch} />
      </header>

      <div className="px-4 mt-5 space-y-6 max-w-2xl mx-auto">
        {/* Install App Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-2xl p-4 flex items-center gap-4 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
          onClick={() => navigate("/instalar")}
        >
          <img src={logoDuarteFull} alt="Duarte Delivery" className="h-12 object-contain" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Instale o app Duarte Delivery</p>
            <p className="text-xs text-muted-foreground">Acesse direto da tela inicial do seu celular</p>
          </div>
          <Button size="sm" className="rounded-xl shrink-0 gap-1">
            <Download className="w-4 h-4" /> Instalar
          </Button>
        </motion.div>

        <section>
          <h2 className="text-lg font-bold mb-3">Categorias</h2>
          <CategoryBar categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
        </section>

        {!search && !selectedCategory && featured.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3">Destaques</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {featured.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="min-w-[260px]">
                  <RestaurantCard restaurant={r} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">
              {selectedCategory ? categories.find((c) => c.id === selectedCategory)?.name : "Restaurantes"}
            </h2>
            {hasMapsKey && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? <List className="w-4 h-4" /> : <Map className="w-4 h-4" />}
                {showMap ? "Lista" : "Mapa"}
              </Button>
            )}
          </div>

          {showMap && hasMapsKey ? (
            <div className="h-[400px] rounded-2xl overflow-hidden border border-border/50">
              <RestaurantMap restaurants={filtered} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum restaurante encontrado</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((r, i) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <RestaurantCard restaurant={r} />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      <CartFloatingBar />
    </div>
  );
};

export default Index;
