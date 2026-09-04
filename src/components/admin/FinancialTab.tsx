import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DollarSign,
  TrendingUp,
  Wallet,
  Receipt,
  Percent,
  CalendarDays,
  Users,
  Store,
  Filter,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  FileText,
  Building,
  User,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles
} from "lucide-react";

// Formatação monetária pt-BR estrita e segura
const formatCurrency = (value: number | null | undefined): string => {
  const val = typeof value === "number" && !isNaN(value) && isFinite(value) ? value : 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
};

// Formatação de data e hora pt-BR estrita
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

const formatDateOnly = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

// Tipos auxiliares locais
interface CreditCodeRecord {
  id: string;
  code: string;
  value: number;
  assigned_to_user_id: string | null;
  used_by: string | null;
  is_used: boolean;
  used_at: string | null;
  created_at: string;
}

interface StoreCreditRecord {
  id: string;
  user_id: string;
  balance: number;
  updated_at: string;
}

interface DeliveryRequestRecord {
  id: string;
  store_owner_id: string;
  driver_id: string | null;
  restaurant_id: string | null;
  driver_fee: number;
  credit_cost: number;
  status: string;
  created_at: string;
  updated_at: string;
  restaurants?: { name: string; owner_id: string | null } | null;
}

interface DriverEarningRecord {
  id: string;
  driver_id: string;
  delivery_request_id: string | null;
  amount: number;
  status: string;
  created_at: string;
}

interface WithdrawalRequestRecord {
  id: string;
  driver_id: string;
  driver_user_id: string;
  amount: number;
  fee_percent: number;
  fee_amount: number;
  net_amount: number;
  status: string;
  pix_key: string | null;
  pix_key_type: string | null;
  created_at: string;
  processed_at: string | null;
}

interface DriverProfileRecord {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  pix_key: string | null;
  pix_key_type: string | null;
  is_active: boolean;
  created_at: string;
}

interface StoreOwnerProfileRecord {
  user_id: string;
  full_name: string;
  phone: string;
  email?: string;
}

const FinancialTab = () => {
  const queryClient = useQueryClient();

  // Estados dos Filtros
  const [period, setPeriod] = useState<string>("mes_atual");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("todos");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("todos");
  const [selectedStatus, setSelectedStatus] = useState<string>("todos");
  const [selectedType, setSelectedType] = useState<string>("todos");

  // Estados de seleção detalhada para modais / visões focadas
  const [detailDriverId, setDetailDriverId] = useState<string | null>(null);
  const [detailStoreUserId, setDetailStoreUserId] = useState<string | null>(null);

  // Queries de Dados Supabase
  const { data: deliveryConfig } = useQuery({
    queryKey: ["financial-delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: creditCodes = [], isLoading: loadingCodes } = useQuery({
    queryKey: ["financial-credit-codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CreditCodeRecord[];
    },
  });

  const { data: storeCredits = [], isLoading: loadingCredits } = useQuery({
    queryKey: ["financial-store-credits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_credits")
        .select("*");
      if (error) throw error;
      return (data || []) as StoreCreditRecord[];
    },
  });

  const { data: deliveryRequests = [], isLoading: loadingRequests } = useQuery({
    queryKey: ["financial-delivery-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("*, restaurants(name, owner_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DeliveryRequestRecord[];
    },
  });

  const { data: driverEarnings = [], isLoading: loadingEarnings } = useQuery({
    queryKey: ["financial-driver-earnings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_earnings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DriverEarningRecord[];
    },
  });

  const { data: withdrawals = [], isLoading: loadingWithdrawals } = useQuery({
    queryKey: ["financial-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as WithdrawalRequestRecord[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["financial-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data || []) as DriverProfileRecord[];
    },
  });

  const { data: storeOwners = [] } = useQuery({
    queryKey: ["financial-store-owners"],
    queryFn: async () => {
      const rpc = await supabase.rpc("admin_list_store_owners");
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
        return rpc.data as StoreOwnerProfileRecord[];
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "store_owner");
      const ids = (roles || []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", ids);
      const map = new Map((profiles || []).map((p) => [p.user_id, p]));
      return ids.map((id) => {
        const p = map.get(id) || { full_name: "", phone: "" };
        return {
          user_id: id,
          full_name: p.full_name || "",
          phone: p.phone || id.slice(0, 8),
          email: p.phone || id.slice(0, 8),
        };
      }) as StoreOwnerProfileRecord[];
    },
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["financial-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name, owner_id");
      if (error) throw error;
      return data || [];
    },
  });

  // Recarregar dados
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["financial-credit-codes"] });
    queryClient.invalidateQueries({ queryKey: ["financial-store-credits"] });
    queryClient.invalidateQueries({ queryKey: ["financial-delivery-requests"] });
    queryClient.invalidateQueries({ queryKey: ["financial-driver-earnings"] });
    queryClient.invalidateQueries({ queryKey: ["financial-withdrawals"] });
    queryClient.invalidateQueries({ queryKey: ["financial-drivers"] });
    queryClient.invalidateQueries({ queryKey: ["financial-store-owners"] });
    toast.success("Dados financeiros atualizados com sucesso!");
  };

  // Cálculo dos limites de datas conforme filtro de período selecionado
  const dateBounds = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (period === "hoje") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === "7d") {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === "30d") {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === "mes_atual") {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === "mes_anterior") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (period === "custom") {
      if (dateFrom) {
        start = new Date(`${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        end = new Date(`${dateTo}T23:59:59.999`);
      }
    }

    return { start, end };
  }, [period, dateFrom, dateTo]);

  // Função auxiliar de checagem de intervalo de data
  const isWithinPeriod = useCallback((dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;

    if (dateBounds.start && d < dateBounds.start) return false;
    if (dateBounds.end && d > dateBounds.end) return false;
    return true;
  }, [dateBounds.start, dateBounds.end]);

  // Mapeamentos rápidos por ID
  const storeOwnerMap = useMemo(() => {
    const map = new Map<string, StoreOwnerProfileRecord>();
    storeOwners.forEach((s) => map.set(s.user_id, s));
    return map;
  }, [storeOwners]);

  const driverMap = useMemo(() => {
    const mapByUserId = new Map<string, DriverProfileRecord>();
    const mapById = new Map<string, DriverProfileRecord>();
    drivers.forEach((d) => {
      mapByUserId.set(d.user_id, d);
      mapById.set(d.id, d);
    });
    return { mapByUserId, mapById };
  }, [drivers]);

  // 1. PROCESSAMENTO DAS ENTRADAS (Recargas Comuns + Recargas Diretas)
  const filteredEntries = useMemo(() => {
    const list: Array<{
      id: string;
      created_at: string;
      type: "Recarga" | "Recarga Direta";
      store_owner_id: string;
      store_name: string;
      owner_name: string;
      value: number;
      status: "Aprovada" | "Pendente" | "Recusada";
    }> = [];

    // Deduplicação por ID
    const seenIds = new Set<string>();

    // A) Códigos de Crédito Resgatados/Gerados
    creditCodes.forEach((c) => {
      if (seenIds.has(c.id)) return;
      seenIds.add(c.id);

      if (!isWithinPeriod(c.created_at)) return;

      const ownerId = c.used_by || c.assigned_to_user_id || "";
      if (selectedStoreId !== "todos" && ownerId !== selectedStoreId) return;

      const owner = storeOwnerMap.get(ownerId);
      const ownerName = owner?.full_name || owner?.email || (ownerId ? ownerId.slice(0, 8) : "—");
      const rest = restaurants.find((r) => r.owner_id === ownerId);
      const storeName = rest?.name || "Loja Cadastrada";

      // Se foi atribuído sem código resgatado especificamente pelo admin, pode ser recarga direta via código ou recarga comum
      const isDirect = !c.code || c.code.startsWith("DIRECT_") || !c.used_by;
      const typeLabel = isDirect ? "Recarga Direta" : "Recarga";

      if (selectedType !== "todos" && selectedType !== "entradas") {
        if (selectedType === "corridas" || selectedType === "saques") return;
      }

      list.push({
        id: c.id,
        created_at: c.created_at,
        type: typeLabel,
        store_owner_id: ownerId,
        store_name: storeName,
        owner_name: ownerName,
        value: Number(c.value) || 0,
        status: c.is_used ? "Aprovada" : "Pendente",
      });
    });

    // B) Recargas Diretas registradas em store_credits (quando o saldo for atualizado sem registro prévio de código)
    storeCredits.forEach((sc) => {
      if (selectedStoreId !== "todos" && sc.user_id !== selectedStoreId) return;
      if (!isWithinPeriod(sc.updated_at)) return;

      // Para evitar duplicidade com os códigos resgatados acima, incluímos apenas se sc tiver histórico ou se não houver código
      const hasCodeForStore = creditCodes.some(
        (c) => (c.used_by === sc.user_id || c.assigned_to_user_id === sc.user_id) && c.is_used
      );

      if (!hasCodeForStore && sc.balance > 0) {
        const scId = `sc-direct-${sc.id}`;
        if (seenIds.has(scId)) return;
        seenIds.add(scId);

        const owner = storeOwnerMap.get(sc.user_id);
        const ownerName = owner?.full_name || owner?.email || sc.user_id.slice(0, 8);
        const rest = restaurants.find((r) => r.owner_id === sc.user_id);

        if (selectedType === "todos" || selectedType === "entradas") {
          list.push({
            id: scId,
            created_at: sc.updated_at,
            type: "Recarga Direta",
            store_owner_id: sc.user_id,
            store_name: rest?.name || "Loja Cadastrada",
            owner_name: ownerName,
            value: Number(sc.balance) || 0,
            status: "Aprovada",
          });
        }
      }
    });

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [creditCodes, storeCredits, storeOwnerMap, restaurants, isWithinPeriod, selectedStoreId, selectedType]);

  // 2. PROCESSAMENTO DAS CORRIDAS (Gross & Net Drivers)
  const filteredDeliveries = useMemo(() => {
    const seenIds = new Set<string>();
    return deliveryRequests.filter((req) => {
      if (seenIds.has(req.id)) return false;
      seenIds.add(req.id);

      if (!isWithinPeriod(req.created_at)) return false;
      if (selectedStoreId !== "todos" && req.store_owner_id !== selectedStoreId) return false;
      if (selectedDriverId !== "todos" && req.driver_id !== selectedDriverId) return false;

      if (selectedStatus !== "todos") {
        if (selectedStatus === "concluido" && req.status !== "delivered") return false;
        if (selectedStatus === "pendente" && req.status === "delivered") return false;
      }

      if (selectedType !== "todos" && selectedType !== "corridas") return false;

      return true;
    });
  }, [deliveryRequests, isWithinPeriod, selectedStoreId, selectedDriverId, selectedStatus, selectedType]);

  // 3. PROCESSAMENTO DOS SAQUES E ANTECIPAÇÕES
  const filteredWithdrawals = useMemo(() => {
    const seenIds = new Set<string>();
    return withdrawals.filter((w) => {
      if (seenIds.has(w.id)) return false;
      seenIds.add(w.id);

      const reqDate = w.processed_at || w.created_at;
      if (!isWithinPeriod(reqDate)) return false;

      if (selectedDriverId !== "todos") {
        if (w.driver_id !== selectedDriverId && w.driver_user_id !== selectedDriverId) return false;
      }

      if (selectedStatus !== "todos") {
        if (selectedStatus === "concluido" && w.status !== "approved") return false;
        if (selectedStatus === "pendente" && w.status !== "pending") return false;
        if (selectedStatus === "recusado" && w.status !== "rejected") return false;
      }

      if (selectedType !== "todos" && selectedType !== "saques") return false;

      return true;
    });
  }, [withdrawals, isWithinPeriod, selectedDriverId, selectedStatus, selectedType]);

  // 4. MAPA DE GANHOS LÍQUIDOS DOS MOTORISTAS POR ENTREGA (driver_earnings)
  const earningsByDeliveryMap = useMemo(() => {
    const map = new Map<string, number>();
    driverEarnings.forEach((e) => {
      if (e.delivery_request_id) {
        map.set(e.delivery_request_id, Number(e.amount) || 0);
      }
    });
    return map;
  }, [driverEarnings]);

  // Taxa de comissão do aplicativo configurada
  const appFeePercentConfig = Number((deliveryConfig as any)?.app_fee_per_delivery ?? 2);

  // 5. CÁLCULO DOS 10 INDICADORES FINANCEIROS (Formulas Oficiais)
  const metrics = useMemo(() => {
    // 1. Total de Recargas (Aprovadas/Resgatadas)
    const totalRecargas = filteredEntries
      .filter((e) => e.type === "Recarga" && e.status === "Aprovada")
      .reduce((sum, e) => sum + e.value, 0);

    // 2. Total de Recarga Direta (Efetivadas)
    const totalRecargaDireta = filteredEntries
      .filter((e) => e.type === "Recarga Direta" && e.status === "Aprovada")
      .reduce((sum, e) => sum + e.value, 0);

    // 3. Receita de Entradas = Recargas + Recarga Direta
    const totalEntradas = totalRecargas + totalRecargaDireta;

    // 4. Valor Bruto das Corridas (apenas entregas concluídas)
    const deliveredRides = filteredDeliveries.filter((r) => r.status === "delivered");
    const valorBrutoCorridas = deliveredRides.reduce(
      (sum, r) => sum + Number(r.driver_fee || r.credit_cost || 0),
      0
    );

    // 5. Valor Gerado para os Motoristas (Soma do valor líquido destinado aos motoristas)
    const valorGeradoMotoristas = deliveredRides.reduce((sum, r) => {
      const netFromEarnings = earningsByDeliveryMap.get(r.id);
      if (netFromEarnings !== undefined) {
        return sum + netFromEarnings;
      }
      // Fallback histórico com base na taxa configurada se earnings não estiver populado
      const gross = Number(r.driver_fee || 0);
      const net = Math.max(0, gross * (1 - appFeePercentConfig / 100));
      return sum + net;
    }, 0);

    // 6. Pago aos Motoristas (Saques e antecipações efetivamente concluídos e aprovados)
    const approvedWithdrawalsList = filteredWithdrawals.filter((w) => w.status === "approved");
    const pagoAosMotoristas = approvedWithdrawalsList.reduce(
      (sum, w) => sum + Number(w.net_amount || 0),
      0
    );

    // 7. Comissão das Corridas = Valor Bruto das Corridas - Valor Líquido dos Motoristas
    const comissaoCorridas = Math.max(0, valorBrutoCorridas - valorGeradoMotoristas);

    // 8. Taxas de Antecipação (Soma das taxas cobradas em saques concluídos)
    const taxasAntecipacao = approvedWithdrawalsList.reduce(
      (sum, w) => sum + Number(w.fee_amount || 0),
      0
    );

    // 9. Receita Operacional = Comissão das Corridas + Taxas de Antecipação
    const receitaOperacional = comissaoCorridas + taxasAntecipacao;

    // 10. Saldo de Caixa = Receita de Entradas - Total Pago aos Motoristas
    const saldoCaixa = totalEntradas - pagoAosMotoristas;

    return {
      totalRecargas,
      totalRecargaDireta,
      totalEntradas,
      valorBrutoCorridas,
      valorGeradoMotoristas,
      pagoAosMotoristas,
      comissaoCorridas,
      taxasAntecipacao,
      receitaOperacional,
      saldoCaixa,
      countDeliveries: deliveredRides.length,
      countWithdrawals: approvedWithdrawalsList.length,
    };
  }, [filteredEntries, filteredDeliveries, filteredWithdrawals, earningsByDeliveryMap, appFeePercentConfig]);

  // Motorista Selecionado para Detalhamento
  const selectedDriverData = useMemo(() => {
    if (!detailDriverId) return null;
    const driverObj = driverMap.mapById.get(detailDriverId) || driverMap.mapByUserId.get(detailDriverId);
    if (!driverObj) return null;

    const driverUserOrId = [driverObj.id, driverObj.user_id];

    // Corridas do motorista
    const myRides = deliveryRequests.filter(
      (r) => driverUserOrId.includes(r.driver_id || "") && r.status === "delivered"
    );
    const grossTotal = myRides.reduce((sum, r) => sum + Number(r.driver_fee || 0), 0);

    // Ganhos líquidos
    const netGenerated = myRides.reduce((sum, r) => {
      const earningNet = earningsByDeliveryMap.get(r.id);
      if (earningNet !== undefined) return sum + earningNet;
      return sum + Math.max(0, Number(r.driver_fee || 0) * (1 - appFeePercentConfig / 100));
    }, 0);

    const historicCommission = Math.max(0, grossTotal - netGenerated);

    // Saques do motorista
    const myWithdrawals = withdrawals.filter((w) =>
      driverUserOrId.includes(w.driver_id || "") || driverUserOrId.includes(w.driver_user_id || "")
    );
    const approvedWithdrawals = myWithdrawals.filter((w) => w.status === "approved");

    const totalPaid = approvedWithdrawals.reduce((sum, w) => sum + Number(w.net_amount || 0), 0);
    const totalFeesPaid = approvedWithdrawals.reduce((sum, w) => sum + Number(w.fee_amount || 0), 0);

    // Saldo disponível = Líquido gerado - Total pago e saques pendentes
    const pendingWithdrawalsSum = myWithdrawals
      .filter((w) => w.status === "pending")
      .reduce((sum, w) => sum + Number(w.amount || 0), 0);

    const availableBalance = Math.max(0, netGenerated - totalPaid - pendingWithdrawalsSum);

    return {
      driver: driverObj,
      ridesCount: myRides.length,
      grossTotal,
      historicCommission,
      netGenerated,
      availableBalance,
      withdrawalsCount: myWithdrawals.length,
      approvedWithdrawalsCount: approvedWithdrawals.length,
      totalFeesPaid,
      totalPaid,
    };
  }, [detailDriverId, driverMap, deliveryRequests, earningsByDeliveryMap, appFeePercentConfig, withdrawals]);

  // Lojista Selecionado para Detalhamento
  const selectedStoreData = useMemo(() => {
    if (!detailStoreUserId) return null;
    const ownerObj = storeOwnerMap.get(detailStoreUserId);
    const rest = restaurants.find((r) => r.owner_id === detailStoreUserId);
    const creditRecord = storeCredits.find((sc) => sc.user_id === detailStoreUserId);

    // Recargas do lojista
    const myCodes = creditCodes.filter(
      (c) => (c.used_by === detailStoreUserId || c.assigned_to_user_id === detailStoreUserId) && c.is_used
    );
    const totalRecargas = myCodes.reduce((sum, c) => sum + Number(c.value || 0), 0);

    // Corridas realizadas pela loja
    const myDeliveries = deliveryRequests.filter((r) => r.store_owner_id === detailStoreUserId);
    const deliveredCount = myDeliveries.filter((r) => r.status === "delivered").length;
    const usedInDeliveries = myDeliveries
      .filter((r) => r.status === "delivered")
      .reduce((sum, r) => sum + Number(r.driver_fee || r.credit_cost || 0), 0);

    return {
      owner: ownerObj,
      storeName: rest?.name || "Loja Cadastrada",
      totalRecargas,
      totalDirectRecharge: creditRecord?.balance || 0,
      operationsCount: myCodes.length + (creditRecord ? 1 : 0),
      creditsAcquired: totalRecargas + (creditRecord?.balance || 0),
      usedInDeliveries,
      deliveredCount,
      currentBalance: creditRecord?.balance || 0,
    };
  }, [detailStoreUserId, storeOwnerMap, restaurants, creditCodes, storeCredits, deliveryRequests]);

  const loadingAny = loadingCodes || loadingCredits || loadingRequests || loadingEarnings || loadingWithdrawals;

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho do Módulo Financeiro */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-5 rounded-xl border shadow-sm">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2 text-foreground">
            <Wallet className="w-5 h-5 text-primary" /> Módulo Financeiro Admin
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consolidação em tempo real de recargas, comissões, antecipações, saques e saldo de caixa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loadingAny}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loadingAny ? "animate-spin" : ""}`} /> Atualizar Dados
          </Button>
        </div>
      </div>

      {/* PAINEL DE FILTROS COMPLETOS */}
      <Card className="shadow-sm border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" /> Filtros Financeiros Globais
            </span>
            <Badge variant="outline" className="text-[11px] font-normal">
              {metrics.countDeliveries} corridas entregues · {metrics.countWithdrawals} saques pagos
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Período */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="mes_atual">Este mês</SelectItem>
                  <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                  <SelectItem value="custom">Período personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lojista / Loja */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Lojista / Loja</Label>
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos os Lojistas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Lojistas</SelectItem>
                  {storeOwners.map((o) => (
                    <SelectItem key={o.user_id} value={o.user_id}>
                      {o.full_name || o.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Motorista */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Motorista</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos os Motoristas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Motoristas</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Status das Operações</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos os Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Status</SelectItem>
                  <SelectItem value="concluido">Concluídos / Aprovados</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="recusado">Recusados / Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Datas personalizadas quando período === 'custom' */}
          {period === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs">Data Inicial</Label>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data Final</Label>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DASHBOARD DE 10 CARDS FINANCEIROS (Reagem aos mesmos filtros) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 1. Total de Recargas */}
        <Card className="shadow-sm hover:border-primary/40 transition-colors">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              1. Total Recargas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-foreground mt-1">
              {formatCurrency(metrics.totalRecargas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Códigos resgatados</p>
          </CardContent>
        </Card>

        {/* 2. Total de Recarga Direta */}
        <Card className="shadow-sm hover:border-primary/40 transition-colors">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              2. Recarga Direta
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
              {formatCurrency(metrics.totalRecargaDireta)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Créditos diretos admin</p>
          </CardContent>
        </Card>

        {/* 3. Total de Entradas */}
        <Card className="shadow-sm bg-green-50/40 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-green-700 dark:text-green-300 font-bold uppercase tracking-wider">
              3. Total Entradas
            </p>
            <p className="text-lg sm:text-xl font-black text-green-700 dark:text-green-300 mt-1">
              {formatCurrency(metrics.totalEntradas)}
            </p>
            <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">Recargas + Recarga Direta</p>
          </CardContent>
        </Card>

        {/* 4. Valor Bruto das Corridas */}
        <Card className="shadow-sm hover:border-primary/40 transition-colors">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              4. Valor Bruto Corridas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-foreground mt-1">
              {formatCurrency(metrics.valorBrutoCorridas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Faturamento bruto entregas</p>
          </CardContent>
        </Card>

        {/* 5. Valor Gerado para Motoristas */}
        <Card className="shadow-sm hover:border-primary/40 transition-colors">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              5. Gerado P/ Motoristas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-primary mt-1">
              {formatCurrency(metrics.valorGeradoMotoristas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Líquido de corridas</p>
          </CardContent>
        </Card>

        {/* 6. Pago aos Motoristas */}
        <Card className="shadow-sm hover:border-primary/40 transition-colors">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              6. Pago Aos Motoristas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
              {formatCurrency(metrics.pagoAosMotoristas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Saques/antecipações pagos</p>
          </CardContent>
        </Card>

        {/* 7. Comissão das Corridas */}
        <Card className="shadow-sm hover:border-primary/40 transition-colors">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              7. Comissão Corridas
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
              {formatCurrency(metrics.comissaoCorridas)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Bruto - Líquido motoristas</p>
          </CardContent>
        </Card>

        {/* 8. Taxas de Antecipação */}
        <Card className="shadow-sm hover:border-primary/40 transition-colors">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              8. Taxas Antecipação
            </p>
            <p className="text-lg sm:text-xl font-extrabold text-orange-600 dark:text-orange-400 mt-1">
              {formatCurrency(metrics.taxasAntecipacao)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Cobradas em saques pagos</p>
          </CardContent>
        </Card>

        {/* 9. Receita Operacional */}
        <Card className="shadow-sm bg-primary/5 border-primary/30">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-primary font-bold uppercase tracking-wider">
              9. Receita Operacional
            </p>
            <p className="text-lg sm:text-xl font-black text-primary mt-1">
              {formatCurrency(metrics.receitaOperacional)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Comissão + Taxas antecipação</p>
          </CardContent>
        </Card>

        {/* 10. Saldo de Caixa */}
        <Card className="shadow-sm bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-3.5 text-center">
            <p className="text-[11px] text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider">
              10. Saldo de Caixa
            </p>
            <p className="text-lg sm:text-xl font-black text-blue-700 dark:text-blue-300 mt-1">
              {formatCurrency(metrics.saldoCaixa)}
            </p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">Entradas - Pago motoristas</p>
          </CardContent>
        </Card>
      </div>

      {/* ABAS DETALHADAS DE HISTÓRICO E ANÁLISES */}
      <Tabs defaultValue="entradas" className="w-full space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto p-1 bg-muted/60">
          <TabsTrigger value="entradas" className="text-xs py-2">
            <ArrowUpRight className="w-3.5 h-3.5 mr-1.5 text-green-600" /> Histórico de Entradas ({filteredEntries.length})
          </TabsTrigger>
          <TabsTrigger value="saidas" className="text-xs py-2">
            <ArrowDownRight className="w-3.5 h-3.5 mr-1.5 text-purple-600" /> Corridas & Saídas ({filteredDeliveries.length + filteredWithdrawals.length})
          </TabsTrigger>
          <TabsTrigger value="motoristas" className="text-xs py-2">
            <User className="w-3.5 h-3.5 mr-1.5 text-primary" /> Por Motorista
          </TabsTrigger>
          <TabsTrigger value="lojistas" className="text-xs py-2">
            <Store className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Por Lojista / Loja
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: HISTÓRICO DE ENTRADAS */}
        <TabsContent value="entradas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Histórico Detalhado de Entradas Financeiras</span>
                <Badge variant="secondary" className="text-xs">
                  Soma: {formatCurrency(metrics.totalEntradas)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data / Hora</TableHead>
                    <TableHead className="text-xs">Tipo de Entrada</TableHead>
                    <TableHead className="text-xs">Lojista / Loja</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">ID da Operação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((item) => (
                    <TableRow key={item.id} className="text-xs">
                      <TableCell className="font-medium whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={item.type === "Recarga Direta" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {item.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-foreground">{item.store_name}</div>
                        <div className="text-[10px] text-muted-foreground">{item.owner_name}</div>
                      </TableCell>
                      <TableCell className="font-bold text-green-600">{formatCurrency(item.value)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={item.status === "Aprovada" ? "default" : "outline"}
                          className={`text-[10px] ${
                            item.status === "Aprovada" ? "bg-green-600 hover:bg-green-700" : ""
                          }`}
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                        {item.id.slice(0, 13)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma entrada registrada para o período ou filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: CORRIDAS & SAÍDAS DE MOTORISTAS */}
        <TabsContent value="saidas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Movimentações dos Motoristas (Corridas, Saques e Antecipações)</span>
                <Badge variant="outline" className="text-xs">
                  {filteredDeliveries.length} corridas · {filteredWithdrawals.length} saques
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data / Hora</TableHead>
                    <TableHead className="text-xs">Motorista</TableHead>
                    <TableHead className="text-xs">Tipo Movimentação</TableHead>
                    <TableHead className="text-xs">Valor Bruto</TableHead>
                    <TableHead className="text-xs">Comissão App</TableHead>
                    <TableHead className="text-xs">Taxa Antecipação</TableHead>
                    <TableHead className="text-xs">Valor Líquido</TableHead>
                    <TableHead className="text-xs text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Corridas */}
                  {filteredDeliveries.map((req) => {
                    const drv = driverMap.mapByUserId.get(req.driver_id || "") || driverMap.mapById.get(req.driver_id || "");
                    const gross = Number(req.driver_fee || req.credit_cost || 0);
                    const earningNet = earningsByDeliveryMap.get(req.id);
                    const net = earningNet !== undefined ? earningNet : Math.max(0, gross * (1 - appFeePercentConfig / 100));
                    const comm = Math.max(0, gross - net);

                    return (
                      <TableRow key={`del-${req.id}`} className="text-xs">
                        <TableCell className="whitespace-nowrap">{formatDate(req.created_at)}</TableCell>
                        <TableCell className="font-semibold">{drv?.full_name || "Motorista —"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                            Corrida
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(gross)}</TableCell>
                        <TableCell className="text-amber-600 font-medium">{formatCurrency(comm)}</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="font-bold text-green-600">{formatCurrency(net)}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={req.status === "delivered" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {req.status === "delivered" ? "Concluída" : req.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Saques */}
                  {filteredWithdrawals.map((w) => {
                    const drv = driverMap.mapById.get(w.driver_id) || driverMap.mapByUserId.get(w.driver_user_id);
                    return (
                      <TableRow key={`with-${w.id}`} className="text-xs bg-muted/20">
                        <TableCell className="whitespace-nowrap">{formatDate(w.created_at)}</TableCell>
                        <TableCell className="font-semibold">{drv?.full_name || "Motorista —"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                            {w.fee_amount > 0 ? "Antecipação" : "Saque"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(w.amount)}</TableCell>
                        <TableCell className="text-muted-foreground">—</TableCell>
                        <TableCell className="text-orange-600 font-medium">
                          {formatCurrency(w.fee_amount)} ({w.fee_percent}%)
                        </TableCell>
                        <TableCell className="font-bold text-purple-600">{formatCurrency(w.net_amount)}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={w.status === "approved" ? "default" : w.status === "rejected" ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {w.status === "approved" ? "Pago / Aprovado" : w.status === "rejected" ? "Recusado" : "Pendente"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredDeliveries.length === 0 && filteredWithdrawals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Nenhuma movimentação de motorista registrada para os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: DETALHAMENTO POR MOTORISTA */}
        <TabsContent value="motoristas" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Selecione um Motorista para Visão Consolidada</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <Label className="text-xs">Entregador / Motorista</Label>
                <Select
                  value={detailDriverId || ""}
                  onValueChange={(val) => setDetailDriverId(val || null)}
                >
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue placeholder="Selecione um entregador" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name} ({d.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedDriverData ? (
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-muted/40 p-4 rounded-lg gap-2">
                    <div>
                      <h3 className="text-base font-extrabold flex items-center gap-2 text-foreground">
                        <User className="w-4 h-4 text-primary" /> {selectedDriverData.driver.full_name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        PIX: {selectedDriverData.driver.pix_key_type || "—"}: {selectedDriverData.driver.pix_key || "Não cadastrada"} · Tel: {selectedDriverData.driver.phone}
                      </p>
                    </div>
                    <Badge variant={selectedDriverData.driver.is_active ? "default" : "secondary"}>
                      {selectedDriverData.driver.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Corridas Concluídas</span>
                      <p className="text-lg font-bold text-foreground mt-0.5">{selectedDriverData.ridesCount}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Valor Bruto Historico</span>
                      <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(selectedDriverData.grossTotal)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Comissão Historica App</span>
                      <p className="text-lg font-bold text-amber-600 mt-0.5">{formatCurrency(selectedDriverData.historicCommission)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Líquido Gerado</span>
                      <p className="text-lg font-bold text-green-600 mt-0.5">{formatCurrency(selectedDriverData.netGenerated)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Saques Solicitados</span>
                      <p className="text-lg font-bold text-foreground mt-0.5">{selectedDriverData.withdrawalsCount}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Taxas Antecipação Pagas</span>
                      <p className="text-lg font-bold text-orange-600 mt-0.5">{formatCurrency(selectedDriverData.totalFeesPaid)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Total Efetivamente Pago</span>
                      <p className="text-lg font-bold text-purple-600 mt-0.5">{formatCurrency(selectedDriverData.totalPaid)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-primary/10 border-primary/30 text-center">
                      <span className="text-[11px] text-primary font-bold">Saldo Disponível Atual</span>
                      <p className="text-lg font-black text-primary mt-0.5">{formatCurrency(selectedDriverData.availableBalance)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  Selecione um motorista no menu acima para consultar o histórico individual detalhado.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: DETALHAMENTO POR LOJISTA / LOJA */}
        <TabsContent value="lojistas" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Selecione um Lojista para Visão Consolidada de Créditos</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <Label className="text-xs">Lojista Destinatário</Label>
                <Select
                  value={detailStoreUserId || ""}
                  onValueChange={(val) => setDetailStoreUserId(val || null)}
                >
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue placeholder="Selecione um lojista" />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOwners.map((o) => (
                      <SelectItem key={o.user_id} value={o.user_id}>
                        {o.full_name || o.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedStoreData ? (
                <div className="space-y-4 pt-4 border-t">
                  <div className="bg-muted/40 p-4 rounded-lg">
                    <h3 className="text-base font-extrabold flex items-center gap-2 text-foreground">
                      <Store className="w-4 h-4 text-blue-600" /> {selectedStoreData.storeName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Lojista: {selectedStoreData.owner?.full_name || selectedStoreData.owner?.email || detailStoreUserId} · Tel: {selectedStoreData.owner?.phone}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Total Recargas Código</span>
                      <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(selectedStoreData.totalRecargas)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Total Recarga Direta</span>
                      <p className="text-lg font-bold text-blue-600 mt-0.5">{formatCurrency(selectedStoreData.totalDirectRecharge)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-background text-center">
                      <span className="text-[11px] text-muted-foreground">Valor Utilizado em Entregas</span>
                      <p className="text-lg font-bold text-amber-600 mt-0.5">{formatCurrency(selectedStoreData.usedInDeliveries)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-center">
                      <span className="text-[11px] text-blue-700 dark:text-blue-300 font-bold">Saldo Atual em Carteira</span>
                      <p className="text-lg font-black text-blue-700 dark:text-blue-300 mt-0.5">{formatCurrency(selectedStoreData.currentBalance)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  Selecione um lojista no menu acima para consultar o histórico individual de créditos e recargas.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Função auxiliar para chave de depuração do React useMemo
function creditCreditsMapKey(codes: CreditCodeRecord[]): string {
  return codes.map((c) => c.id).join(",");
}

export default FinancialTab;
