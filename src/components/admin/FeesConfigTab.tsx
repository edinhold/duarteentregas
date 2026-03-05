import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings, MessageCircle } from "lucide-react";

const FeesConfigTab = () => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ base_fee: "5", fee_per_km: "1.5", early_withdrawal_fee_percent: "10", whatsapp_number: "" });

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
        early_withdrawal_fee_percent: String((config as any).early_withdrawal_fee_percent ?? 10),
        whatsapp_number: (config as any).whatsapp_number || "",
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
        early_withdrawal_fee_percent: parseFloat(form.early_withdrawal_fee_percent) || 10,
        whatsapp_number: form.whatsapp_number.trim(),
      } as any).eq("id", config.id);
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
          <Label>Taxa de saque antecipado (%)</Label>
          <Input type="number" step="1" min="0" max="100" value={form.early_withdrawal_fee_percent} onChange={(e) => setForm(f => ({ ...f, early_withdrawal_fee_percent: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Porcentagem descontada em saques antecipados do motorista</p>
        </div>
        <div className="border-t pt-4 mt-4 space-y-2">
          <Label className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-[#25D366]" /> Número do WhatsApp</Label>
          <Input placeholder="5511999999999" value={form.whatsapp_number} onChange={(e) => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Número com código do país (ex: 5511999999999). Deixe vazio para desativar o botão flutuante.</p>
        </div>
        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? "Salvando..." : "Salvar Configuração"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FeesConfigTab;
