import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Ticket, Copy, Trash2, Percent, Save } from "lucide-react";

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const CreditsTab = () => {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState("1");
  const [value, setValue] = useState("10");
  const [generating, setGenerating] = useState(false);
  const [promoPercent, setPromoPercent] = useState("");
  const [savingPromo, setSavingPromo] = useState(false);

  const { data: codes = [] } = useQuery({
    queryKey: ["admin-credit-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_codes").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const { data: config } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_config").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (config && (config as any).promo_credit_percent !== undefined) {
      setPromoPercent(String((config as any).promo_credit_percent));
    }
  }, [config]);

  const handleSavePromo = async () => {
    const percent = parseFloat(promoPercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      toast.error("Informe um valor entre 0 e 100%");
      return;
    }
    if (!config?.id) return;
    setSavingPromo(true);
    try {
      const { error } = await supabase
        .from("delivery_config")
        .update({ promo_credit_percent: percent } as any)
        .eq("id", config.id);
      if (error) throw error;
      toast.success(`Promoção de ${percent}% salva com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["delivery-config"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar promoção");
    } finally {
      setSavingPromo(false);
    }
  };

  const handleGenerate = async () => {
    const qty = parseInt(quantity) || 1;
    const val = parseFloat(value) || 10;
    if (qty < 1 || qty > 50) { toast.error("Gere entre 1 e 50 códigos"); return; }
    setGenerating(true);
    try {
      const newCodes = Array.from({ length: qty }, () => ({
        code: generateCode(),
        value: val,
      }));
      const { error } = await supabase.from("credit_codes").insert(newCodes);
      if (error) throw error;
      toast.success(`${qty} código(s) gerado(s)!`);
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar");
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("credit_codes").delete().eq("id", id);
      if (error) throw error;
      toast.success("Código excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-credit-codes"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  };

  return (
    <div className="space-y-4">
      {/* Seção Promoção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4" /> Gerar Crédito de Promoção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure a porcentagem de crédito promocional que será aplicada automaticamente.
          </p>
          <div className="flex gap-3 items-end">
            <div className="space-y-2">
              <Label>Porcentagem (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="Ex: 10"
                value={promoPercent}
                onChange={(e) => setPromoPercent(e.target.value)}
                className="w-32"
              />
            </div>
            <Button onClick={handleSavePromo} disabled={savingPromo}>
              <Save className="w-4 h-4 mr-1" />
              {savingPromo ? "Salvando..." : "Salvar"}
            </Button>
          </div>
          {config && (config as any).promo_credit_percent > 0 && (
            <p className="text-sm text-primary font-medium">
              Promoção ativa: {(config as any).promo_credit_percent}% de crédito extra
            </p>
          )}
        </CardContent>
      </Card>

      {/* Seção Gerar Códigos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="w-4 h-4" /> Gerar Códigos de Crédito
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" min="1" max="50" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-24" />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="5" value={value} onChange={(e) => setValue(e.target.value)} className="w-28" />
            </div>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? "Gerando..." : "Gerar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Códigos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Códigos Gerados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold">{c.code}</TableCell>
                  <TableCell>R$ {Number(c.value).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={c.is_used ? "secondary" : "default"}>
                      {c.is_used ? "Usado" : "Disponível"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {!c.is_used && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyCode(c.code)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {codes.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum código gerado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditsTab;
