import { useCart } from "@/contexts/CartContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, CreditCard, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { restaurants } from "@/data/mock";
import { useState } from "react";
import { toast } from "sonner";

const Checkout = () => {
  const { items, total, clearCart, restaurantId } = useCart();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  const restaurant = restaurants.find((r) => r.id === restaurantId);
  const deliveryFee = restaurant?.deliveryFee || 0;

  const handleOrder = async () => {
    setIsProcessing(true);
    // Simulate order
    await new Promise((r) => setTimeout(r, 1500));
    toast.success("Pedido realizado com sucesso! 🎉");
    clearCart();
    navigate("/");
  };

  if (items.length === 0) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg">Finalizar Pedido</h1>
      </header>

      <div className="px-4 mt-4 space-y-4 max-w-2xl mx-auto">
        {/* Address */}
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Endereço de entrega</h2>
          </div>
          <Input placeholder="Rua, número" className="rounded-lg mb-2" />
          <Input placeholder="Complemento (opcional)" className="rounded-lg mb-2" />
          <Input placeholder="Bairro" className="rounded-lg" />
        </div>

        {/* Payment */}
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Pagamento</h2>
          </div>
          <div className="space-y-2">
            {["Cartão de Crédito", "Cartão de Débito", "PIX", "Dinheiro"].map((method) => (
              <label key={method} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted cursor-pointer">
                <input type="radio" name="payment" className="accent-primary" defaultChecked={method === "PIX"} />
                <span className="text-sm font-medium">{method}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Order summary */}
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <h2 className="font-bold mb-3">Resumo</h2>
          {items.map((item) => (
            <div key={item.product.id} className="flex justify-between text-sm py-1">
              <span>{item.quantity}x {item.product.name}</span>
              <span>R$ {(item.product.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t mt-2 pt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>R$ {total.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span>R$ {deliveryFee.toFixed(2)}</span></div>
            <div className="flex justify-between font-extrabold text-base pt-1 border-t">
              <span>Total</span><span>R$ {(total + deliveryFee).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 max-w-2xl mx-auto">
        <Button
          className="w-full rounded-xl h-12 text-base font-bold"
          onClick={handleOrder}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <span className="flex items-center gap-2"><span className="animate-spin">⏳</span> Processando...</span>
          ) : (
            <span className="flex items-center gap-2"><Check className="w-5 h-5" /> Confirmar Pedido</span>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Checkout;
