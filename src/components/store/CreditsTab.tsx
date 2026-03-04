import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CreditCard, Ticket } from "lucide-react";

interface CreditsTabProps {
  credits: any;
}

const CreditsTab = ({ credits }: CreditsTabProps) => {
  const queryClient = useQueryClient();
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.rpc("redeem_credit_code", { p_code: redeemCode.trim().toUpperCase() });
      if (error) throw error;
      if (!data) { toast.error("Código inválido ou já usado"); return; }
      toast.success("Créditos adicionados!");
      setRedeemCode("");
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao resgatar");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Meus Créditos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">Saldo disponível</p>
            <p className="text-4xl font-extrabold text-primary">R$ {(credits?.balance || 0).toFixed(2)}</p>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Código de recarga" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value.toUpperCase())} className="font-mono" />
            <Button onClick={handleRedeem} disabled={redeeming} size="sm">
              <Ticket className="w-4 h-4 mr-1" /> {redeeming ? "..." : "Resgatar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">Insira o código de recarga fornecido pelo administrador</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditsTab;
