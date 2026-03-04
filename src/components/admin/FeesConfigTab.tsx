import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings } from "lucide-react";

const FeesConfigTab = () => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ base_fee: "5", fee_per_km: "1.5", credit_cost_per_call: "3" });

  const { data: config } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_config").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (config) {
      setForm({
        base_fee: String(config.base_fee),
        fee_per_km: String(config.fee_per_km),
        credit_cost_per_call: String(config.credit_cost_per_call),
      });
    }
  }, [config]);

  const handleSave = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("delivery_config").update({
        base_fee: parseFloat(form.base_fee) || 0,
        fee_per_km: parseFloat(form.fee_per_km) || 0,
        credit_cost_per_call: parseFloat(form.credit_cost_per_call) || 0,
      }).eq("id", config.id);
      if (error) throw error;
      toast.success("Configuração salva!");
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="w-4 h-4" /> Configuração de Taxas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label>Taxa base de entrega (R$)</Label>
          <Input type="number" step="0.5" value={form.base_fee} onChange={(e) => setForm(f => ({ ...f, base_fee: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Valor fixo cobrado em toda entrega</p>
        </div>
        <div className="space-y-2">
          <Label>Taxa por km (R$/km)</Label>
          <Input type="number" step="0.1" value={form.fee_per_km} onChange={(e) => setForm(f => ({ ...f, fee_per_km: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Valor adicional por quilômetro percorrido</p>
        </div>
        <div className="space-y-2">
          <Label>Custo de crédito por chamada (créditos)</Label>
          <Input type="number" step="1" value={form.credit_cost_per_call} onChange={(e) => setForm(f => ({ ...f, credit_cost_per_call: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Créditos descontados do lojista ao chamar entregador</p>
        </div>
        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? "Salvando..." : "Salvar Configuração"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FeesConfigTab;
