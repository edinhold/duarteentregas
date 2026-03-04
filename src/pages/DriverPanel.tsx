import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Phone, MessageSquare, Send, Check, DollarSign, Key, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { GoogleMap, MarkerF, InfoWindowF } from "@react-google-maps/api";
import { playNotificationSound } from "@/lib/notificationSound";
import { GOOGLE_MAPS_API_KEY, DEFAULT_CENTER, DEFAULT_ZOOM } from "@/config/maps";

const hasMapsKey = GOOGLE_MAPS_API_KEY !== "YOUR_GOOGLE_MAPS_API_KEY";

const DriverPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [chatMessage, setChatMessage] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [savingPix, setSavingPix] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Get driver profile
  const { data: driverProfile } = useQuery({
    queryKey: ["my-driver-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").eq("user_id", user!.id).limit(1).single();
      if (error) return null;
      return data;
    },
    enabled: !!user,
  });

  // Load PIX info from profile
  useEffect(() => {
    if (driverProfile) {
      setPixKey((driverProfile as any).pix_key || "");
      setPixKeyType((driverProfile as any).pix_key_type || "cpf");
    }
  }, [driverProfile]);

  // Get pending delivery requests
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["driver-pending-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name, address, logo, latitude, longitude)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get my accepted requests
  const { data: myRequests = [] } = useQuery({
    queryKey: ["driver-my-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name, address, logo, latitude, longitude)")
        .eq("driver_id", user!.id)
        .in("status", ["accepted", "picked_up"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const activeRequest = myRequests[0];

  // Chat messages
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["driver-chat", activeRequest?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("delivery_request_id", activeRequest!.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!activeRequest,
  });

  // Store owner profile for phone
  const { data: storeOwnerProfile } = useQuery({
    queryKey: ["store-owner-profile", activeRequest?.store_owner_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("phone, full_name").eq("user_id", activeRequest!.store_owner_id).single();
      return data;
    },
    enabled: !!activeRequest,
  });

  // Get earnings
  const { data: earnings = [] } = useQuery({
    queryKey: ["my-earnings", driverProfile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_earnings")
        .select("*")
        .eq("driver_id", driverProfile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!driverProfile,
  });

  // Get withdrawal requests
  const { data: withdrawals = [] } = useQuery({
    queryKey: ["my-withdrawals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("driver_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get delivery config
  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data } = await supabase.from("delivery_config").select("*").limit(1).single();
      return data;
    },
  });

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("driver-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        playNotificationSound();
        toast("🚀 Nova entrega disponível!", { duration: 6000 });
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Nova Entrega!", { body: "Uma nova solicitação de entrega está disponível.", icon: "/favicon.ico" });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        queryClient.invalidateQueries({ queryKey: ["driver-my-requests", user.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        if (activeRequest) {
          queryClient.invalidateQueries({ queryKey: ["driver-chat", activeRequest.id] });
          if (payload.new?.sender_id !== user.id) {
            playNotificationSound();
            toast("💬 Nova mensagem do lojista");
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Nova mensagem", { body: payload.new?.message || "Mensagem recebida", icon: "/favicon.ico" });
            }
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeRequest?.id]);

  const acceptRequest = async (requestId: string) => {
    try {
      const driverFee = Number(deliveryConfig?.base_fee || 5);
      const { error } = await supabase.from("delivery_requests").update({
        driver_id: user!.id,
        status: "accepted",
        driver_fee: driverFee,
      } as any).eq("id", requestId).eq("status", "pending");
      if (error) throw error;
      toast.success(`Entrega aceita! Você ganhará R$ ${driverFee.toFixed(2)}`);
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao aceitar");
    }
  };

  const updateStatus = async (requestId: string, status: string) => {
    try {
      const { error } = await supabase.from("delivery_requests").update({ status }).eq("id", requestId);
      if (error) throw error;

      // If delivered, create earning record
      if (status === "delivered" && activeRequest && driverProfile) {
        const fee = Number((activeRequest as any).driver_fee || deliveryConfig?.base_fee || 5);
        await supabase.from("driver_earnings").insert({
          driver_id: driverProfile.id,
          delivery_request_id: requestId,
          amount: fee,
          status: "pending",
        } as any);
        queryClient.invalidateQueries({ queryKey: ["my-earnings"] });
      }

      toast.success("Status atualizado!");
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro");
    }
  };

  const savePixKey = async () => {
    if (!driverProfile || !pixKey.trim()) return;
    setSavingPix(true);
    try {
      const { error } = await supabase.from("drivers").update({
        pix_key: pixKey.trim(),
        pix_key_type: pixKeyType,
      } as any).eq("id", driverProfile.id);
      if (error) throw error;
      toast.success("Chave PIX salva!");
      queryClient.invalidateQueries({ queryKey: ["my-driver-profile"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSavingPix(false);
    }
  };

  const requestWithdrawal = async () => {
    const totalPending = earnings
      .filter((e: any) => e.status === "pending")
      .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

    if (totalPending <= 0) {
      toast.error("Sem saldo disponível para saque");
      return;
    }

    if (!pixKey.trim()) {
      toast.error("Cadastre sua chave PIX primeiro");
      return;
    }

    setWithdrawing(true);
    try {
      const feePercent = Number((deliveryConfig as any)?.early_withdrawal_fee_percent ?? 10);
      const feeAmount = (totalPending * feePercent) / 100;
      const netAmount = totalPending - feeAmount;

      const { error } = await supabase.from("withdrawal_requests").insert({
        driver_id: driverProfile!.id,
        driver_user_id: user!.id,
        amount: totalPending,
        fee_percent: feePercent,
        fee_amount: feeAmount,
        net_amount: netAmount,
        pix_key: pixKey,
        pix_key_type: pixKeyType,
      } as any);
      if (error) throw error;
      toast.success(`Saque solicitado! Valor líquido: R$ ${netAmount.toFixed(2)}`);
      queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao solicitar saque");
    } finally {
      setWithdrawing(false);
    }
  };

  const sendMessage = async () => {
    if (!chatMessage.trim() || !activeRequest) return;
    try {
      const { error } = await supabase.from("chat_messages").insert({
        delivery_request_id: activeRequest.id,
        sender_id: user!.id,
        message: chatMessage.trim(),
      });
      if (error) throw error;
      setChatMessage("");
      queryClient.invalidateQueries({ queryKey: ["driver-chat", activeRequest.id] });
    } catch {
      toast.error("Erro ao enviar");
    }
  };

  const mapMarkers = pendingRequests
    .filter((r: any) => r.restaurants?.latitude && r.restaurants?.longitude)
    .map((r: any) => ({
      id: r.id,
      lat: r.restaurants.latitude,
      lng: r.restaurants.longitude,
      name: r.restaurants.name,
      address: r.restaurants.address,
      request: r,
    }));

  const totalEarnings = earnings.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const pendingBalance = earnings
    .filter((e: any) => e.status === "pending")
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const feePercent = Number((deliveryConfig as any)?.early_withdrawal_fee_percent ?? 10);

  if (!user) return <div className="p-8 text-center">Faça login para acessar</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="font-bold text-lg">Painel do Entregador</h1>
      </header>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Earnings Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-extrabold text-primary">R$ {totalEarnings.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Total Ganho</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-extrabold text-green-600">R$ {pendingBalance.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Saldo Disponível</p>
            </CardContent>
          </Card>
        </div>

        {/* PIX Key */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" /> Chave PIX</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <Select value={pixKeyType} onValueChange={setPixKeyType}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="random">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Sua chave PIX" />
              </div>
            </div>
            <Button onClick={savePixKey} disabled={savingPix} size="sm" className="w-full">
              {savingPix ? "Salvando..." : "Salvar Chave PIX"}
            </Button>
          </CardContent>
        </Card>

        {/* Withdrawal */}
        {pendingBalance > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4" /> Solicitar Saque</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Saldo disponível</span>
                  <span className="font-bold">R$ {pendingBalance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Taxa de saque ({feePercent}%)</span>
                  <span>- R$ {(pendingBalance * feePercent / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-1">
                  <span>Valor líquido</span>
                  <span className="text-primary">R$ {(pendingBalance - (pendingBalance * feePercent / 100)).toFixed(2)}</span>
                </div>
              </div>
              <Button onClick={requestWithdrawal} disabled={withdrawing} className="w-full">
                {withdrawing ? "Solicitando..." : "💰 Solicitar Saque Antecipado"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Withdrawal History */}
        {withdrawals.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Histórico de Saques</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {withdrawals.map((w: any) => (
                  <div key={w.id} className="p-3 rounded-lg bg-muted/50 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-bold">R$ {Number(w.net_amount).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(w.created_at).toLocaleDateString("pt-BR")} • Taxa: {w.fee_percent}%
                      </p>
                    </div>
                    <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                      {w.status === "approved" ? "Aprovado" : w.status === "rejected" ? "Rejeitado" : "Pendente"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active delivery */}
        {activeRequest && (
          <Card className="border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Entrega Ativa
                <Badge className="ml-auto">R$ {Number((activeRequest as any).driver_fee || deliveryConfig?.base_fee || 5).toFixed(2)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="font-bold">{activeRequest.restaurants?.name || "Loja"}</p>
                {storeOwnerProfile && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-3 h-3" />
                    <a href={`tel:${storeOwnerProfile.phone}`} className="text-primary underline">{storeOwnerProfile.phone || "Sem telefone"}</a>
                    <span className="text-muted-foreground">({storeOwnerProfile.full_name})</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">📍 Coleta: {activeRequest.pickup_address}</p>
                <p className="text-xs text-muted-foreground">🏠 Entrega: {activeRequest.delivery_address}</p>
                {activeRequest.notes && <p className="text-xs">📝 {activeRequest.notes}</p>}
              </div>

              <div className="flex gap-2">
                {activeRequest.status === "accepted" && (
                  <Button onClick={() => updateStatus(activeRequest.id, "picked_up")} className="flex-1" size="sm">
                    📦 Coletei
                  </Button>
                )}
                {activeRequest.status === "picked_up" && (
                  <Button onClick={() => updateStatus(activeRequest.id, "delivered")} className="flex-1" size="sm">
                    ✅ Entreguei
                  </Button>
                )}
              </div>

              {/* Chat */}
              <div className="border-t pt-3">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1"><MessageSquare className="w-4 h-4" /> Chat</p>
                <div className="max-h-48 overflow-y-auto space-y-2 bg-muted/30 rounded-lg p-3 mb-2">
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
                  <Input value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Mensagem..." onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
                  <Button size="icon" onClick={sendMessage}><Send className="w-4 h-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Map */}
        {hasMapsKey && mapMarkers.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Entregas no Mapa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 rounded-lg overflow-hidden">
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  center={mapMarkers[0] ? { lat: mapMarkers[0].lat, lng: mapMarkers[0].lng } : DEFAULT_CENTER}
                  zoom={DEFAULT_ZOOM}
                >
                  {mapMarkers.map((m) => (
                    <MarkerF key={m.id} position={{ lat: m.lat, lng: m.lng }} onClick={() => setSelectedRequest(m)} />
                  ))}
                  {selectedRequest && (
                    <InfoWindowF position={{ lat: selectedRequest.lat, lng: selectedRequest.lng }} onCloseClick={() => setSelectedRequest(null)}>
                      <div className="p-1 min-w-[140px]">
                        <h3 style={{ fontWeight: "bold", fontSize: 14 }}>{selectedRequest.name}</h3>
                        <p style={{ fontSize: 11, color: "#666" }}>{selectedRequest.address}</p>
                        <p style={{ fontSize: 12, fontWeight: "bold", marginTop: 4 }}>
                          Ganho: R$ {Number(deliveryConfig?.base_fee || 5).toFixed(2)}
                        </p>
                        <button
                          onClick={() => acceptRequest(selectedRequest.request.id)}
                          style={{ marginTop: 6, background: "hsl(27, 100%, 50%)", color: "white", border: "none", padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                        >
                          Aceitar Entrega
                        </button>
                      </div>
                    </InfoWindowF>
                  )}
                </GoogleMap>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending requests list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entregas Disponíveis ({pendingRequests.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingRequests.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhuma entrega disponível</p>
            ) : (
              <div className="space-y-2">
                {pendingRequests.map((r: any) => (
                  <div key={r.id} className="p-3 rounded-lg bg-muted/50 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm">{r.restaurants?.name || "Loja"}</p>
                      <p className="text-xs text-muted-foreground">📍 {r.pickup_address} → {r.delivery_address}</p>
                      {r.notes && <p className="text-xs">📝 {r.notes}</p>}
                      <p className="text-xs font-bold text-primary mt-1">
                        💰 R$ {Number(deliveryConfig?.base_fee || 5).toFixed(2)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => acceptRequest(r.id)} disabled={!!activeRequest}>
                      <Check className="w-4 h-4 mr-1" /> Aceitar
                    </Button>
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

export default DriverPanel;
