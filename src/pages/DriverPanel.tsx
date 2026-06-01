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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Phone, MessageSquare, Send, Check, DollarSign, Key, Wallet, XCircle, Home, History, Settings, Map as MapIcon, Signal, SignalZero, Calendar, Radar, PanelLeft } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { isToday, isThisWeek, isThisMonth } from "date-fns";
import { playNotificationSound, playUrgentNotification, startStandbyMode, stopStandbyMode, resumeAudioContext } from "@/lib/notificationSound";
import DriverGPS from "@/components/driver/DriverGPS";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import DriverNotificationSettings from "@/components/driver/DriverNotificationSettings";
import ChatWidget from "@/components/ChatWidget";
import ThemeToggle from "@/components/ThemeToggle";
import GlobalDriverMap from "@/components/GlobalDriverMap";
import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const isMobile = useIsMobile();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast.success("Internet restabelecida"); };
    const handleOffline = () => { setIsOnline(false); toast.error("Você está offline"); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  // Single instance of GPS tracking for the whole panel
  const trackingData = useGPSTracking({ 
    userId: user?.id,
    driverId: driverProfile?.id
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

  // Get my completed (delivered) requests
  const { data: completedRequests = [] } = useQuery({
    queryKey: ["driver-completed-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name, address, logo, latitude, longitude)")
        .eq("driver_id", user!.id)
        .eq("status", "delivered")
        .order("created_at", { ascending: false })
        .limit(20);
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
      const { data } = await supabase.from("public_delivery_config").select("*").limit(1).single();
      return data;
    },
  });

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Standby mode: activate when no active request, deactivate when busy
  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem("driver-notification-settings") || "{}");
    if (settings.standbyEnabled && !activeRequest && pendingRequests.length === 0) {
      startStandbyMode(settings.standbyIntervalMs || 30000);
    } else {
      stopStandbyMode();
    }
    return () => stopStandbyMode();
  }, [activeRequest, pendingRequests.length]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    
    // Unlock audio context on first user interaction in the panel
    const handleFirstInteraction = () => {
      resumeAudioContext();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    const channel = supabase.channel("driver-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_requests" }, (payload) => {
        console.log("New delivery request received:", payload);
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        
        // Use a timeout to ensure audio is ready and played clearly
        setTimeout(() => {
          playUrgentNotification();
          toast("🚀 Nova entrega disponível!", { 
            duration: 10000,
            action: {
              label: "Ver",
              onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          });
        }, 500);

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Nova Entrega!", { 
            body: "Uma nova solicitação de entrega está disponível.", 
            icon: "/favicon.ico"
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "delivery_requests" }, (payload: any) => {
        console.log("Delivery request updated:", payload);
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        queryClient.invalidateQueries({ queryKey: ["driver-my-requests", user.id] });
        queryClient.invalidateQueries({ queryKey: ["driver-completed-requests", user.id] });
        queryClient.invalidateQueries({ queryKey: ["my-earnings", driverProfile?.id] });
        
        // If status changed to accepted and I am the driver, or if it was accepted by someone else
        if (payload.new?.status === "accepted") {
          if (payload.new?.driver_id === user.id) {
            playNotificationSound();
            toast.success("✅ Pedido confirmado para você!");
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_earnings" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-earnings", driverProfile?.id] });
        playNotificationSound();
        toast.success("💰 Novo ganho registrado!");
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log("Realtime subscribed successfully");
        }
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.error("Realtime connection issues:", status);
          // Don't reload, Supabase will try to reconnect automatically
          // Just show a subtle warning if it stays closed for too long
        }
      });

    return () => { 
      supabase.removeChannel(channel); 
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [user, activeRequest?.id, driverProfile?.id]);
  
  // Keep driver active status synced while panel is open
  useEffect(() => {
    if (!user?.id) return;
    
    const keepActive = async () => {
      await supabase.from("drivers").update({ is_active: true, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    };
    
    keepActive();
    const interval = setInterval(keepActive, 60000); // Every minute
    
    return () => clearInterval(interval);
  }, [user?.id]);

  const acceptRequest = async (requestId: string) => {
    try {
      // First check if it's still pending and not already taken or finished
      const { data: currentReq, error: checkError } = await supabase
        .from("delivery_requests")
        .select("status")
        .eq("id", requestId)
        .single();
      
      if (checkError || !currentReq) throw new Error("Pedido não encontrado");
      if (currentReq.status !== "pending") {
        toast.error("Este pedido já foi aceito ou finalizado por outro entregador");
        queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
        return;
      }

      // Get the existing driver_fee
      const { data: requestData, error: fetchError } = await supabase
        .from("delivery_requests")
        .select("driver_fee")
        .eq("id", requestId)
        .single();
      if (fetchError) throw fetchError;

      const driverFee = Number(requestData?.driver_fee || deliveryConfig?.base_fee || 5);

      const { error } = await supabase.from("delivery_requests").update({
        driver_id: user!.id,
        status: "accepted",
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
      if (status === "delivered") {
        // Use secure RPC that validates ownership and inserts earnings atomically
        const { error } = await (supabase as any).rpc("complete_delivery", {
          p_request_id: requestId,
        });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["my-earnings", driverProfile?.id] });
      } else {
        const { error } = await supabase.from("delivery_requests").update({ status }).eq("id", requestId);
        if (error) throw error;
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
      const paymentDay = Number((deliveryConfig as any)?.payment_day ?? 15);
      const today = new Date().getDate();
      const isPaymentDay = today === paymentDay;
      const feePercent = isPaymentDay ? 0 : Number((deliveryConfig as any)?.early_withdrawal_fee_percent ?? 10);
      const feeAmount = (totalPending * feePercent) / 100;
      const { error } = await (supabase as any).rpc("request_withdrawal");
      if (error) throw error;
      toast.success(`Saque solicitado com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["my-earnings"] });
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

  const cancelRequest = async (requestId: string) => {
    setCancelling(true);
    try {
      const { error } = await supabase.from("delivery_requests").update({
        driver_id: null,
        status: "pending",
      } as any).eq("id", requestId);
      if (error) throw error;
      toast.success("Entrega cancelada e devolvida para disponíveis");
      queryClient.invalidateQueries({ queryKey: ["driver-my-requests"] });
      queryClient.invalidateQueries({ queryKey: ["driver-pending-requests"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar");
    } finally {
      setCancelling(false);
      setCancelRequestId(null);
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
  const dailyEarnings = earnings
    .filter((e: any) => isToday(new Date(e.created_at)))
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const weeklyEarnings = earnings
    .filter((e: any) => isThisWeek(new Date(e.created_at), { weekStartsOn: 0 }))
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const monthlyEarnings = earnings
    .filter((e: any) => isThisMonth(new Date(e.created_at)))
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

  const pendingBalance = earnings
    .filter((e: any) => e.status === "pending")
    .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const paymentDay = Number((deliveryConfig as any)?.payment_day ?? 15);
  const isPaymentDay = new Date().getDate() === paymentDay;
  const feePercent = isPaymentDay ? 0 : Number((deliveryConfig as any)?.early_withdrawal_fee_percent ?? 10);
  const netPreview = pendingBalance - (pendingBalance * feePercent) / 100;

  if (!user) return <div className="p-8 text-center">Faça login para acessar</div>;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar role="driver" currentTab={activeTab} onTabChange={setActiveTab} />
        
        <SidebarInset className="flex-1">
          <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
            <SidebarTrigger className="md:flex" />
            <button onClick={() => navigate("/")} className="hover:bg-muted p-1 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-lg flex-1 truncate">Painel do Entregador</h1>
            
            <div className="flex items-center gap-2">
              {trackingData.watching ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 gap-1 px-2 py-0 h-6 hidden xs:flex">
                  <Signal className="w-3 h-3" /> <span className="text-[10px]">GPS OK</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 gap-1 px-2 py-0 h-6 animate-pulse hidden xs:flex">
                  <SignalZero className="w-3 h-3" /> <span className="text-[10px]">GPS OFF</span>
                </Badge>
              )}
              {!isOnline && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 gap-1 px-2 py-0 h-6 animate-bounce">
                  <SignalZero className="w-3 h-3" /> <span className="text-[10px]">OFFLINE</span>
                </Badge>
              )}
              <ThemeToggle />
            </div>
          </header>

          <main className="p-4 max-w-4xl mx-auto w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
              {isMobile && (
                <TabsList className="grid w-full grid-cols-5 bg-muted/50 p-1 rounded-xl">
                  <TabsTrigger value="home" className="rounded-lg"><Home className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="map" className="rounded-lg"><MapIcon className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="radar" className="rounded-lg"><Radar className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="finance" className="rounded-lg"><Wallet className="w-4 h-4" /></TabsTrigger>
                  <TabsTrigger value="settings" className="rounded-lg"><Settings className="w-4 h-4" /></TabsTrigger>
                </TabsList>
              )}
            <TabsTrigger value="home" className="flex items-center gap-1 py-2">
              <Home className="w-4 h-4" /> <span className="text-[10px] xs:text-xs">Início</span>
            </TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-1 py-2">
              <MapIcon className="w-4 h-4" /> <span className="text-[10px] xs:text-xs">GPS</span>
            </TabsTrigger>
            <TabsTrigger value="radar" className="flex items-center gap-1 py-2">
              <Radar className="w-4 h-4" /> <span className="text-[10px] xs:text-xs">Radar</span>
            </TabsTrigger>
            <TabsTrigger value="finance" className="flex items-center gap-1 py-2">
              <Wallet className="w-4 h-4" /> <span className="text-[10px] xs:text-xs">Ganhos</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1 py-2">
              <Settings className="w-4 h-4" /> <span className="text-[10px] xs:text-xs">Ajustes</span>
            </TabsTrigger>
          </TabsList>


          <TabsContent value="home" className="space-y-4 outline-none">
            {/* GPS Tracking & Map */}
            <DriverGPS
              activeRequest={activeRequest}
              pendingRequests={pendingRequests}
              onAcceptRequest={acceptRequest}
              trackingData={trackingData}
            />

            {/* Active delivery */}
            {activeRequest && (
              <Card className="border-primary shadow-md">
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
                      <>
                        <Button onClick={() => updateStatus(activeRequest.id, "picked_up")} className="flex-1" size="sm">
                          📦 Coletei
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setCancelRequestId(activeRequest.id)}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Cancelar
                        </Button>
                      </>
                    )}
                    {activeRequest.status === "picked_up" && (
                      <Button onClick={() => updateStatus(activeRequest.id, "delivered")} className="flex-1" size="sm">
                        ✅ Entreguei
                      </Button>
                    )}
                  </div>

                  {/* Chat */}
                  <div className="border-t pt-3">
                    <ChatWidget
                      deliveryRequestId={activeRequest.id}
                      currentUserId={user.id}
                      title="Chat com Lojista"
                      maxHeight="max-h-48"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pending requests list */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Entregas Disponíveis</span>
                  <Badge variant="secondary">{pendingRequests.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-muted-foreground">Nenhuma entrega disponível no momento</p>
                    <p className="text-xs text-muted-foreground italic">Mantenha a tela aberta para receber notificações</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((r: any) => (
                      <div key={r.id} className="p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{r.restaurants?.name || "Loja"}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">📍 {r.pickup_address}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">🏠 {r.delivery_address}</p>
                          </div>
                          <p className="text-sm font-bold text-primary whitespace-nowrap">
                            R$ {Number(r.driver_fee || deliveryConfig?.base_fee || 5).toFixed(2)}
                          </p>
                        </div>
                        <Button className="w-full" size="sm" onClick={() => acceptRequest(r.id)} disabled={!!activeRequest}>
                          <Check className="w-4 h-4 mr-1" /> Aceitar Entrega
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="map" className="space-y-4 outline-none -mx-4 -mt-4">
            <div className="h-[calc(100vh-120px)] w-full">
               <DriverGPS
                activeRequest={activeRequest}
                pendingRequests={pendingRequests}
                onAcceptRequest={acceptRequest}
                trackingData={trackingData}
              />
            </div>
          </TabsContent>

          <TabsContent value="radar" className="space-y-4 outline-none">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Radar className="w-4 h-4 text-primary" /> Radar de Entregadores
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-6">
                <GlobalDriverMap />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finance" className="space-y-4 outline-none">
            {/* Earnings Summary */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-extrabold text-primary">R$ {totalEarnings.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Total Ganho</p>
                </CardContent>
              </Card>
              <Card className="bg-accent/5 border-accent/20">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-extrabold text-accent">R$ {pendingBalance.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Saldo Atual</p>
                </CardContent>
              </Card>
            </div>

            {/* Earnings Report */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> Relatório de Ganhos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-lg bg-muted/50 border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold text-[8px] sm:text-[10px]">Hoje</p>
                    <p className="text-sm font-bold text-primary">R$ {dailyEarnings.toFixed(2)}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50 border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold text-[8px] sm:text-[10px]">Semana</p>
                    <p className="text-sm font-bold text-primary">R$ {weeklyEarnings.toFixed(2)}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50 border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold text-[8px] sm:text-[10px]">Mês</p>
                    <p className="text-sm font-bold text-primary">R$ {monthlyEarnings.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Completed deliveries */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4 text-green-500" /> Histórico de Entregas
                  <Badge variant="outline" className="ml-auto">{completedRequests.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {completedRequests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Nenhuma entrega finalizada ainda</p>
                ) : (
                  <div className="space-y-3">
                    {completedRequests.map((r: any) => (
                      <div key={r.id} className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{r.restaurants?.name || "Loja"}</p>
                          <p className="text-xs text-muted-foreground truncate">🏠 {r.delivery_address}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {new Date(r.updated_at).toLocaleDateString("pt-BR")} • {new Date(r.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/30 shrink-0">
                          ✅ Entregue
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* PIX Key */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" /> Chave PIX para Recebimento</CardTitle>
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
                  {savingPix ? "Salvando..." : "Salvar Configurações PIX"}
                </Button>
              </CardContent>
            </Card>

            {/* Withdrawal */}
            {pendingBalance > 0 && (
              <Card className="border-accent/30 bg-accent/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4" /> Solicitar Saque</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {isPaymentDay ? (
                    <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 text-center">
                      <p className="text-sm font-bold text-accent">🎉 Hoje é dia de pagamento!</p>
                      <p className="text-xs text-muted-foreground">Saque sem taxa de antecipação</p>
                    </div>
                  ) : (
                    <div className="bg-muted border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">
                        Dia de pagamento sem taxa: <strong>dia {paymentDay}</strong>
                      </p>
                    </div>
                  )}
                  <div className="bg-background rounded-lg p-3 space-y-1 border">
                    <div className="flex justify-between text-sm">
                      <span>Saldo disponível</span>
                      <span className="font-bold">R$ {pendingBalance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Taxa {isPaymentDay ? "(isento)" : `de antecipação (${feePercent}%)`}</span>
                      <span>- R$ {(pendingBalance * feePercent / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold border-t pt-1 mt-1">
                      <span>Valor a receber</span>
                      <span className="text-primary text-lg">R$ {netPreview.toFixed(2)}</span>
                    </div>
                  </div>
                  <Button onClick={requestWithdrawal} disabled={withdrawing} className="w-full mt-2" variant="default">
                    {withdrawing ? "Processando..." : isPaymentDay ? "💰 Solicitar Saque" : "💰 Solicitar Saque Antecipado"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Earnings per delivery */}
            {earnings.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4" /> Últimos Ganhos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {earnings.slice(0, 5).map((e: any) => (
                      <div key={e.id} className="p-3 rounded-lg bg-muted/50 flex justify-between items-center">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleDateString("pt-BR")} às {new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">R$ {Number(e.amount).toFixed(2)}</p>
                          <Badge variant={e.status === "paid" ? "default" : "secondary"} className="text-[10px] h-4">
                            {e.status === "paid" ? "Pago" : "Pendente"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
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
                      <div key={w.id} className="p-3 rounded-lg border bg-muted/20 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-bold">R$ {Number(w.net_amount).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(w.created_at).toLocaleDateString("pt-BR")} • Taxa: {w.fee_percent}%
                          </p>
                        </div>
                        <Badge variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "secondary"} className="text-[10px]">
                          {w.status === "approved" ? "Aprovado" : w.status === "rejected" ? "Rejeitado" : "Pendente"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 outline-none">
            {/* Notification Settings */}
            <DriverNotificationSettings />
          </TabsContent>
              </motion.div>
            </Tabs>
          </main>
        </SidebarInset>
      </div>

      <AlertDialog open={!!cancelRequestId} onOpenChange={(open) => !open && setCancelRequestId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar entrega?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido voltará para a lista de entregas disponíveis e outro motorista poderá aceitá-lo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelRequestId && cancelRequest(cancelRequestId)}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? "Cancelando..." : "Sim, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default DriverPanel;
