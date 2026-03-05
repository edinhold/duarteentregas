import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";
import ChatWidget from "@/components/ChatWidget";

const statusLabels: Record<string, string> = {
  pending: "Aguardando",
  accepted: "Aceito",
  picked_up: "Coletado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const ChatTab = () => {
  const { user } = useAuth();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Get all active delivery requests (admin can see all)
  const { data: requests = [] } = useQuery({
    queryKey: ["admin-delivery-requests-chat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name)")
        .in("status", ["pending", "accepted", "picked_up"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Also get recent completed ones
  const { data: recentRequests = [] } = useQuery({
    queryKey: ["admin-delivery-requests-chat-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name)")
        .in("status", ["delivered", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const allRequests = [...requests, ...recentRequests];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Conversas de Entregas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allRequests.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Nenhuma entrega com chat disponível</p>
          ) : (
            <div className="space-y-2">
              {allRequests.map((r: any) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedRequestId(r.id === selectedRequestId ? null : r.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedRequestId === r.id ? "bg-primary/10 border border-primary" : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm">{(r as any).restaurants?.name || "Loja"}</p>
                      <p className="text-xs text-muted-foreground">#{r.id.slice(0, 8)}</p>
                    </div>
                    <Badge variant={
                      r.status === "delivered" ? "default" :
                      r.status === "cancelled" ? "destructive" :
                      "secondary"
                    }>
                      {statusLabels[r.status] || r.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    📍 {r.pickup_address} → {r.delivery_address}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRequestId && user && (
        <ChatWidget
          deliveryRequestId={selectedRequestId}
          currentUserId={user.id}
          title="Chat da Entrega (Admin)"
          maxHeight="max-h-80"
        />
      )}
    </div>
  );
};

export default ChatTab;
