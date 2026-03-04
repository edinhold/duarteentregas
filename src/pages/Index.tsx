import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { restaurants, categories } from "@/data/mock";
import { useAuth } from "@/contexts/AuthContext";
import CategoryBar from "@/components/CategoryBar";
import RestaurantCard from "@/components/RestaurantCard";
import SearchBar from "@/components/SearchBar";
import CartFloatingBar from "@/components/CartFloatingBar";
import { Button } from "@/components/ui/button";
import { User, LogOut, Settings } from "lucide-react";
import { motion } from "framer-motion";

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = restaurants;
    if (selectedCategory) {
      const catName = categories.find((c) => c.id === selectedCategory)?.name;
      list = list.filter((r) => r.category === catName);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    }
    return list;
  }, [search, selectedCategory]);

  const featured = restaurants.filter((r) => r.isFeatured && r.isOpen);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-4 pt-10 pb-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-heading)" }}>
            🍽️ FoodExpress
          </h1>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Button size="icon" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/20 rounded-full" onClick={() => navigate("/admin")}>
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
        {/* Categories */}
        <section>
          <h2 className="text-lg font-bold mb-3">Categorias</h2>
          <CategoryBar selected={selectedCategory} onSelect={setSelectedCategory} />
        </section>

        {/* Featured */}
        {!search && !selectedCategory && featured.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3">Destaques</h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {featured.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="min-w-[260px]"
                >
                  <RestaurantCard restaurant={r} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* All restaurants */}
        <section>
          <h2 className="text-lg font-bold mb-3">
            {selectedCategory
              ? categories.find((c) => c.id === selectedCategory)?.name
              : "Restaurantes"}
          </h2>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum restaurante encontrado</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
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
