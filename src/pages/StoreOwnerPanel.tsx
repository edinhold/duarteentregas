import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Truck, UtensilsCrossed, CreditCard, Store, Map as MapIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemeToggle from "@/components/ThemeToggle";
import CallDriverTab from "@/components/store/CallDriverTab";
import MenuTab from "@/components/store/MenuTab";
import CreditsTab from "@/components/store/CreditsTab";
import StoreInfoTab from "@/components/store/StoreInfoTab";
import GlobalDriverMap from "@/components/GlobalDriverMap";

const StoreOwnerPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").eq("owner_id", user!.id).limit(1).single();
      if (error) return null;
      return data;
    },
    enabled: !!user,
  });

  const { data: credits } = useQuery({
    queryKey: ["my-credits", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_credits").select("*").eq("user_id", user!.id).limit(1).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["my-delivery-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_requests").select("*").eq("store_owner_id", user!.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const activeRequest = requests.find((r: any) => ["accepted", "picked_up"].includes(r.status));

  const { data: chatMessages = [] } = useQuery({
    queryKey: ["chat-messages", activeRequest?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("delivery_request_id", activeRequest!.id).order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!activeRequest,
  });

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("store-owner-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests", filter: `store_owner_id=eq.${user.id}` }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["my-delivery-requests", user.id] });
        if (payload.new?.status === "accepted" && payload.old?.status === "pending") {
          toast.success("🎉 Um entregador aceitou sua entrega!", { duration: 8000 });
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Entrega Aceita!", { body: "Um entregador aceitou seu pedido de entrega.", icon: "/favicon.ico" });
          }
        }
        if (payload.new?.status === "picked_up") toast.info("📦 Entregador coletou o pedido!");
        if (payload.new?.status === "delivered") toast.success("✅ Entrega concluída!");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        if (activeRequest) {
          queryClient.invalidateQueries({ queryKey: ["chat-messages", activeRequest.id] });
          if (payload.new?.sender_id !== user.id) {
            toast("💬 Nova mensagem do entregador");
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Nova mensagem", { body: payload.new?.message || "Mensagem recebida", icon: "/favicon.ico" });
            }
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeRequest?.id]);

  if (!user) return <div className="p-8 text-center">Faça login para acessar</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg flex-1">Painel do Lojista</h1>
        <ThemeToggle />
      </header>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 max-w-2xl mx-auto">
        <Tabs defaultValue="store" className="w-full">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="store" className="flex items-center gap-1.5 text-xs">
              <Store className="w-4 h-4" /> Loja
            </TabsTrigger>
            <TabsTrigger value="menu" className="flex items-center gap-1.5 text-xs">
              <UtensilsCrossed className="w-4 h-4" /> Cardápio
            </TabsTrigger>
            <TabsTrigger value="driver" className="flex items-center gap-1.5 text-xs">
              <Truck className="w-4 h-4" /> Entregador
            </TabsTrigger>
            <TabsTrigger value="credits" className="flex items-center gap-1.5 text-xs">
              <CreditCard className="w-4 h-4" /> Recarga
            </TabsTrigger>
          </TabsList>

          <TabsContent value="store" className="mt-4">
            <StoreInfoTab restaurant={restaurant} userId={user.id} />
          </TabsContent>

          <TabsContent value="menu" className="mt-4">
            <MenuTab restaurant={restaurant} />
          </TabsContent>

          <TabsContent value="driver" className="mt-4">
            <CallDriverTab user={user} restaurant={restaurant} requests={requests} activeRequest={activeRequest} chatMessages={chatMessages} />
          </TabsContent>

          <TabsContent value="credits" className="mt-4">
            <CreditsTab credits={credits} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

export default StoreOwnerPanel;
