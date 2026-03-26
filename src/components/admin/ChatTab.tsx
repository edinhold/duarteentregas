import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ChatWidget from "@/components/ChatWidget";
import DeleteConfirm from "@/components/admin/DeleteConfirm";

const statusLabels: Record<string, string> = {
  pending: "Aguardando",
  accepted: "Aceito",
  picked_up: "Coletado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const ChatTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleDeleteAllChats = async () => {
    setDeleting(true);
    try {
      // First check how many messages exist
      const { count, error: countError } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true });
      
      if (countError) throw countError;
      
      if (!count || count === 0) {
        toast.info("Nenhuma mensagem para apagar.");
        setDeleting(false);
        setShowDeleteAll(false);
        return;
      }

      const { error } = await supabase
        .from("chat_messages")
        .delete()
        .gte("created_at", "1970-01-01T00:00:00Z");
      
      if (error) throw error;
      
      toast.success(`${count} mensagem(ns) do chat apagadas com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["admin-delivery-requests-chat"] });
      queryClient.invalidateQueries({ queryKey: ["admin-delivery-requests-chat-recent"] });
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      setSelectedRequestId(null);
    } catch (err: any) {
      console.error("Erro ao apagar mensagens:", err);
      toast.error(err.message || "Erro ao apagar mensagens. Verifique suas permissões de administrador.");
    } finally {
      setDeleting(false);
      setShowDeleteAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Conversas de Entregas
          </CardTitle>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteAll(true)}>
            <Trash2 className="w-4 h-4 mr-1" /> Apagar Tudo
          </Button>
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
      <DeleteConfirm
        open={showDeleteAll}
        onOpenChange={setShowDeleteAll}
        onConfirm={handleDeleteAllChats}
        title="todas as mensagens do chat"
        loading={deleting}
      />
    </div>
  );
};

export default ChatTab;
