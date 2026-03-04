import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Store, Save } from "lucide-react";

interface StoreInfoTabProps {
  restaurant: any;
  userId: string;
}

const StoreInfoTab = ({ restaurant, userId }: StoreInfoTabProps) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    delivery_time: "30-45 min",
    delivery_fee: "0",
    min_order: "0",
    is_open: true,
  });

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name || "",
        address: restaurant.address || "",
        delivery_time: restaurant.delivery_time || "30-45 min",
        delivery_fee: String(restaurant.delivery_fee || 0),
        min_order: String(restaurant.min_order || 0),
        is_open: restaurant.is_open ?? true,
      });
    }
  }, [restaurant]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Nome da loja é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        address: form.address || null,
        delivery_time: form.delivery_time,
        delivery_fee: parseFloat(form.delivery_fee) || 0,
        min_order: parseFloat(form.min_order) || 0,
        is_open: form.is_open,
      };

      if (restaurant) {
        const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurant.id);
        if (error) throw error;
        toast.success("Dados atualizados!");
      } else {
        const { error } = await supabase.from("restaurants").insert({
          ...payload,
          owner_id: userId,
          category_name: "Geral",
        });
        if (error) throw error;
        toast.success("Loja criada!");
      }
      queryClient.invalidateQueries({ queryKey: ["my-restaurant", userId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Store className="w-4 h-4" /> Minha Loja
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Nome da loja *</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome do estabelecimento" />
        </div>
        <div className="space-y-2">
          <Label>Endereço</Label>
          <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Tempo de entrega</Label>
            <Input value={form.delivery_time} onChange={(e) => setForm((f) => ({ ...f, delivery_time: e.target.value }))} placeholder="30-45 min" />
          </div>
          <div className="space-y-2">
            <Label>Taxa de entrega (R$)</Label>
            <Input type="number" step="0.01" min="0" value={form.delivery_fee} onChange={(e) => setForm((f) => ({ ...f, delivery_fee: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Pedido mínimo (R$)</Label>
            <Input type="number" step="0.01" min="0" value={form.min_order} onChange={(e) => setForm((f) => ({ ...f, min_order: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={form.is_open} onCheckedChange={(v) => setForm((f) => ({ ...f, is_open: v }))} />
            <Label>{form.is_open ? "Aberto" : "Fechado"}</Label>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="w-4 h-4 mr-2" /> {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default StoreInfoTab;
