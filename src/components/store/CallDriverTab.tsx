import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Truck, MessageSquare, Send } from "lucide-react";

interface CallDriverTabProps {
  user: any;
  restaurant: any;
  requests: any[];
  activeRequest: any;
  chatMessages: any[];
}

const CallDriverTab = ({ user, restaurant, requests, activeRequest, chatMessages }: CallDriverTabProps) => {
  const queryClient = useQueryClient();
  const [callForm, setCallForm] = useState({ pickup: "", delivery: "", notes: "" });
  const [calling, setCalling] = useState(false);
  const [chatMessage, setChatMessage] = useState("");

  const statusLabels: Record<string, string> = {
    pending: "Aguardando", accepted: "Aceito", picked_up: "Coletado", delivered: "Entregue", cancelled: "Cancelado",
  };

  const handleCallDriver = async () => {
    if (!callForm.pickup.trim() || !callForm.delivery.trim()) {
      toast.error("Preencha endereço de coleta e entrega");
      return;
    }
    setCalling(true);
    try {
      const { error } = await supabase.rpc("deduct_credits_for_delivery", {
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
        sender_id: user.id,
        message: chatMessage.trim(),
      });
      if (error) throw error;
      setChatMessage("");
      queryClient.invalidateQueries({ queryKey: ["chat-messages", activeRequest.id] });
    } catch {
      toast.error("Erro ao enviar mensagem");
    }
  };

  return (
    <div className="space-y-4">
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
    </div>
  );
};

export default CallDriverTab;
