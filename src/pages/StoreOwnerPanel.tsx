import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Truck, CreditCard, Ticket, MessageSquare, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const StoreOwnerPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [callForm, setCallForm] = useState({ pickup: "", delivery: "", notes: "" });
  const [calling, setCalling] = useState(false);
  const [chatMessage, setChatMessage] = useState("");

  // Get store owner's restaurant
  const { data: restaurant } = useQuery({
    queryKey: ["my-restaurant", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("*").eq("owner_id", user!.id).limit(1).single();
      if (error) return null;
      return data;
    },
    enabled: !!user,
  });

  // Get credits
  const { data: credits } = useQuery({
    queryKey: ["my-credits", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("store_credits").select("*").eq("user_id", user!.id).limit(1).single();
      return data;
    },
    enabled: !!user,
  });

  // Get delivery requests
  const { data: requests = [] } = useQuery({
    queryKey: ["my-delivery-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_requests").select("*").eq("store_owner_id", user!.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get active request's chat messages
  const activeRequest = requests.find((r: any) => r.status === "accepted");
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["chat-messages", activeRequest?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("delivery_request_id", activeRequest!.id).order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!activeRequest,
  });

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Realtime for delivery requests and chat
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("store-owner-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests", filter: `store_owner_id=eq.${user.id}` }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["my-delivery-requests", user.id] });
        if (payload.new?.status === "accepted" && payload.old?.status === "pending") {
          toast.success("🎉 Um entregador aceitou sua entrega!", { duration: 8000 });
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Entrega Aceita!", {
              body: "Um entregador aceitou seu pedido de entrega.",
              icon: "/favicon.ico",
            });
          }
        }
        if (payload.new?.status === "picked_up") {
          toast.info("📦 Entregador coletou o pedido!");
        }
        if (payload.new?.status === "delivered") {
          toast.success("✅ Entrega concluída!");
        }
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

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.rpc("redeem_credit_code", { p_code: redeemCode.trim().toUpperCase() });
      if (error) throw error;
      if (!data) { toast.error("Código inválido ou já usado"); return; }
      toast.success("Créditos adicionados!");
      setRedeemCode("");
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao resgatar");
    } finally {
      setRedeeming(false);
    }
  };

  const handleCallDriver = async () => {
    if (!callForm.pickup.trim() || !callForm.delivery.trim()) {
      toast.error("Preencha endereço de coleta e entrega");
      return;
    }
    setCalling(true);
    try {
      const { data, error } = await supabase.rpc("deduct_credits_for_delivery", {
        p_pickup_address: callForm.pickup,
        p_delivery_address: callForm.delivery,
        p_notes: callForm.notes || null,
        p_restaurant_id: restaurant?.id || null,
      });
      if (error) throw error;
      toast.success("Entregador chamado! Aguarde aceitação.");
      setCallForm({ pickup: "", delivery: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao chamar entregador");
    } finally {
      setCalling(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim() || !activeRequest) return;
    try {
      const { error } = await supabase.from("chat_messages").insert({
        delivery_request_id: activeRequest.id,
        sender_id: user!.id,
        message: chatMessage.trim(),
      });
      if (error) throw error;
      setChatMessage("");
      queryClient.invalidateQueries({ queryKey: ["chat-messages", activeRequest.id] });
    } catch (err: any) {
      toast.error("Erro ao enviar mensagem");
    }
  };

  const statusLabels: Record<string, string> = {
    pending: "Aguardando", accepted: "Aceito", picked_up: "Coletado", delivered: "Entregue", cancelled: "Cancelado",
  };

  if (!user) return <div className="p-8 text-center">Faça login para acessar</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Painel do Lojista</h1>
      </header>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Credits */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Créditos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-extrabold text-primary">R$ {(credits?.balance || 0).toFixed(2)}</p>
            <div className="flex gap-2">
              <Input placeholder="Código de recarga" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value.toUpperCase())} className="font-mono" />
              <Button onClick={handleRedeem} disabled={redeeming} size="sm">
                <Ticket className="w-4 h-4 mr-1" /> {redeeming ? "..." : "Resgatar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Call Driver */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4" /> Chamar Entregador</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Endereço de coleta *</Label>
              <Input value={callForm.pickup} onChange={(e) => setCallForm(f => ({ ...f, pickup: e.target.value }))} placeholder={restaurant?.address || "Endereço da loja"} />
            </div>
            <div className="space-y-2">
              <Label>Endereço de entrega *</Label>
              <Input value={callForm.delivery} onChange={(e) => setCallForm(f => ({ ...f, delivery: e.target.value }))} placeholder="Endereço do cliente" />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={callForm.notes} onChange={(e) => setCallForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Detalhes da entrega..." />
            </div>
            <Button onClick={handleCallDriver} disabled={calling} className="w-full">
              {calling ? "Chamando..." : "📲 Chamar Entregador"}
            </Button>
          </CardContent>
        </Card>

        {/* Chat with driver */}
        {activeRequest && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Chat com Entregador</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-60 overflow-y-auto space-y-2 bg-muted/30 rounded-lg p-3">
                {chatMessages.length === 0 && <p className="text-xs text-muted-foreground text-center">Nenhuma mensagem</p>}
                {chatMessages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.sender_id === user.id ? "justify-end" : "justify-start"}`}>
                    <div className={`px-3 py-2 rounded-xl max-w-[80%] text-sm ${msg.sender_id === user.id ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                      {msg.message}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Digite uma mensagem..." onKeyDown={(e) => e.key === "Enter" && sendChatMessage()} />
                <Button size="icon" onClick={sendChatMessage}><Send className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delivery History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entregas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhuma entrega solicitada</p>
            ) : (
              <div className="space-y-2">
                {requests.map((r: any) => (
                  <div key={r.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-bold">#{r.id.slice(0, 8)}</p>
                      <Badge variant={r.status === "delivered" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"}>
                        {statusLabels[r.status] || r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">📍 {r.pickup_address} → {r.delivery_address}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default StoreOwnerPanel;
