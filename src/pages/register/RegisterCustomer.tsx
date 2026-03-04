import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, User, Mail, Lock, Phone } from "lucide-react";
import { motion } from "framer-motion";

const RegisterCustomer = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;

      if (data.user) {
        // Update profile with phone
        await supabase.from("profiles").update({ phone: form.phone }).eq("user_id", data.user.id);

        // Assign customer role
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "user" as any });
      }

      toast.success("Cadastro realizado! Verifique seu e-mail para confirmar.");
      navigate("/auth");
    } catch (error: any) {
      toast.error(error.message || "Erro no cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-primary text-primary-foreground px-4 pt-10 pb-16 rounded-b-3xl">
        <button onClick={() => navigate("/auth")} className="mb-4">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl font-extrabold">👤 Cadastro Cliente</h1>
        <p className="text-primary-foreground/80 mt-1">Crie sua conta para fazer pedidos</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 -mt-8 max-w-md mx-auto w-full pb-8"
      >
        <div className="bg-card rounded-2xl p-6 shadow-lg border border-border/50">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="fullName" placeholder="Seu nome" value={form.fullName} onChange={(e) => handleChange("fullName", e.target.value)} className="pl-10 rounded-xl h-11" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="seu@email.com" value={form.email} onChange={(e) => handleChange("email", e.target.value)} className="pl-10 rounded-xl h-11" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="phone" placeholder="(00) 00000-0000" value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} className="pl-10 rounded-xl h-11" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="password" type="password" placeholder="••••••••" value={form.password} onChange={(e) => handleChange("password", e.target.value)} className="pl-10 rounded-xl h-11" required minLength={6} />
              </div>
            </div>
            <Button type="submit" className="w-full rounded-xl h-12 font-bold text-base" disabled={loading}>
              {loading ? "Cadastrando..." : "Criar conta"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Já tem conta?{" "}
            <button onClick={() => navigate("/auth")} className="text-primary font-semibold">
              Faça login
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterCustomer;
