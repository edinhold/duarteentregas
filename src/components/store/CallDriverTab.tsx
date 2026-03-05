import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Truck, DollarSign } from "lucide-react";
import ChatWidget from "@/components/ChatWidget";

interface CallDriverTabProps {
  user: any;
  restaurant: any;
  requests: any[];
  activeRequest: any;
  chatMessages: any[];
}

const CallDriverTab = ({ user, restaurant, requests, activeRequest, chatMessages }: CallDriverTabProps) => {
  const queryClient = useQueryClient();
  const [callForm, setCallForm] = useState({ pickup: "", delivery: "", notes: "", distance_km: "" });
  const [calling, setCalling] = useState(false);

  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data } = await supabase.from("delivery_config").select("*").limit(1).single();
      return data;
    },
  });

  const baseFee = deliveryConfig?.base_fee ?? 5;
  const feePerKm = deliveryConfig?.fee_per_km ?? 1.5;
  const distanceKm = parseFloat(callForm.distance_km) || 0;
  const deliveryCost = baseFee + feePerKm * distanceKm;
  const statusLabels: Record<string, string> = {
    pending: "Aguardando", accepted: "Aceito", picked_up: "Coletado", delivered: "Entregue", cancelled: "Cancelado",
  };

  const handleCallDriver = async () => {
    if (!callForm.pickup.trim() || !callForm.delivery.trim()) {
      toast.error("Preencha endereço de coleta e entrega");
      return;
    }
    if (distanceKm <= 0) {
      toast.error("Informe a distância em km");
      return;
    }
    setCalling(true);
    try {
      const { error } = await supabase.rpc("deduct_credits_for_delivery", {
        p_pickup_address: callForm.pickup,
        p_delivery_address: callForm.delivery,
        p_notes: callForm.notes || null,
        p_restaurant_id: restaurant?.id || null,
        p_distance_km: distanceKm,
      } as any);
      if (error) throw error;
      toast.success(`Entregador chamado! Custo: R$ ${deliveryCost.toFixed(2)}`);
      setCallForm({ pickup: "", delivery: "", notes: "", distance_km: "" });
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao chamar entregador");
    } finally {
      setCalling(false);
    }
  };

  // Chat is now handled by ChatWidget

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
          <div className="space-y-2">
            <Label>Distância (km) *</Label>
            <Input type="number" step="0.1" min="0" value={callForm.distance_km} onChange={(e) => setCallForm(f => ({ ...f, distance_km: e.target.value }))} placeholder="Ex: 3.5" />
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 border border-accent">
            <DollarSign className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Valor da corrida: <span className="text-primary">R$ {deliveryCost.toFixed(2).replace(".", ",")}</span></p>
              <p className="text-xs text-muted-foreground">
                Taxa fixa R$ {baseFee.toFixed(2).replace(".", ",")} + {distanceKm.toFixed(1)} km × R$ {feePerKm.toFixed(2).replace(".", ",")}
              </p>
            </div>
          </div>
          <Button onClick={handleCallDriver} disabled={calling} className="w-full">
            {calling ? "Chamando..." : `📲 Chamar Entregador (R$ ${deliveryCost.toFixed(2).replace(".", ",")})`}
          </Button>
        </CardContent>
      </Card>

      {/* Chat with driver */}
      {activeRequest && (
        <ChatWidget
          deliveryRequestId={activeRequest.id}
          currentUserId={user.id}
          title="Chat com Entregador"
        />
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
