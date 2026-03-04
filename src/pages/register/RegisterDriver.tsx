import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Bike, Mail, Lock, Phone, User, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { GoogleMap, Marker, Circle } from "@react-google-maps/api";
import { GOOGLE_MAPS_API_KEY } from "@/config/maps";

const defaultCenter = { lat: -23.5505, lng: -46.6333 };

const RegisterDriver = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    cpf: "",
    password: "",
    vehicleType: "moto",
    vehiclePlate: "",
    zoneDescription: "",
    pixKey: "",
    pixKeyType: "cpf",
  });
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [selectedPos, setSelectedPos] = useState(defaultCenter);
  const [radius, setRadius] = useState(5);

  const hasMapsKey = GOOGLE_MAPS_API_KEY !== "YOUR_GOOGLE_MAPS_API_KEY";

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setSelectedPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, []);

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
        await supabase.from("profiles").update({ phone: form.phone }).eq("user_id", data.user.id);

        // Insert driver record
        await supabase.from("drivers").insert({
          user_id: data.user.id,
          full_name: form.fullName,
          phone: form.phone,
          cpf: form.cpf || null,
          vehicle_type: form.vehicleType,
          vehicle_plate: form.vehiclePlate || null,
          zone_lat: selectedPos.lat,
          zone_lng: selectedPos.lng,
          zone_radius_km: radius,
          zone_description: form.zoneDescription || null,
          pix_key: form.pixKey || null,
          pix_key_type: form.pixKeyType || null,
        } as any);

        // Assign driver role
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "driver" as any });
      }

      toast.success("Cadastro de entregador realizado com sucesso!");
      navigate("/entregador");
    } catch (error: any) {
      toast.error(error.message || "Erro no cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-emerald-600 text-white px-4 pt-10 pb-16 rounded-b-3xl">
        <button onClick={() => navigate("/auth")} className="mb-4">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <Bike className="w-8 h-8" /> Cadastro Entregador
        </h1>
        <p className="text-white/80 mt-1">Comece a entregar e ganhar dinheiro</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 -mt-8 max-w-lg mx-auto w-full pb-8"
      >
        <div className="bg-card rounded-2xl p-6 shadow-lg border border-border/50">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Personal Info */}
            <h3 className="font-bold text-foreground">Dados Pessoais</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Seu nome" value={form.fullName} onChange={(e) => handleChange("fullName", e.target.value)} className="pl-10 rounded-xl h-11" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input placeholder="000.000.000-00" value={form.cpf} onChange={(e) => handleChange("cpf", e.target.value)} className="rounded-xl h-11" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="email" placeholder="seu@email.com" value={form.email} onChange={(e) => handleChange("email", e.target.value)} className="pl-10 rounded-xl h-11" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="(00) 00000-0000" value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} className="pl-10 rounded-xl h-11" required />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder="••••••••" value={form.password} onChange={(e) => handleChange("password", e.target.value)} className="pl-10 rounded-xl h-11" required minLength={6} />
              </div>
            </div>

            {/* Vehicle Info */}
            <h3 className="font-bold text-foreground pt-2">Veículo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de veículo</Label>
                <Select value={form.vehicleType} onValueChange={(v) => handleChange("vehicleType", v)}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="moto">🏍️ Moto</SelectItem>
                    <SelectItem value="bicicleta">🚲 Bicicleta</SelectItem>
                    <SelectItem value="carro">🚗 Carro</SelectItem>
                    <SelectItem value="a_pe">🚶 A pé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Placa (se aplicável)</Label>
                <Input placeholder="ABC-1234" value={form.vehiclePlate} onChange={(e) => handleChange("vehiclePlate", e.target.value)} className="rounded-xl h-11" />
              </div>
            </div>

            {/* Delivery Zone Map */}
            <h3 className="font-bold text-foreground pt-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Zona de Entrega
            </h3>
            <p className="text-sm text-muted-foreground">Clique no mapa para definir o centro da sua zona de entrega</p>

            {hasMapsKey ? (
              <div className="rounded-xl overflow-hidden border border-border h-64">
                <GoogleMap
                  mapContainerStyle={{ width: "100%", height: "100%" }}
                  center={mapCenter}
                  zoom={12}
                  onClick={onMapClick}
                >
                  <Marker position={selectedPos} />
                  <Circle
                    center={selectedPos}
                    radius={radius * 1000}
                    options={{
                      fillColor: "#10b981",
                      fillOpacity: 0.15,
                      strokeColor: "#10b981",
                      strokeWeight: 2,
                    }}
                  />
                </GoogleMap>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border h-48 flex items-center justify-center bg-muted/30">
                <p className="text-sm text-muted-foreground text-center px-4">
                  Mapa não disponível. Informe sua zona de entrega abaixo.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Raio de entrega (km)</Label>
                <Input type="number" min={1} max={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <Label>Bairro/Região</Label>
                <Input placeholder="Ex: Centro, Zona Sul" value={form.zoneDescription} onChange={(e) => handleChange("zoneDescription", e.target.value)} className="rounded-xl h-11" />
              </div>
            </div>

            {/* PIX Key */}
            <h3 className="font-bold text-foreground pt-2 flex items-center gap-2">💰 Chave PIX</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de chave</Label>
                <Select value={form.pixKeyType} onValueChange={(v) => handleChange("pixKeyType", v)}>
                  <SelectTrigger className="rounded-xl h-11">
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
              <div className="space-y-2">
                <Label>Chave PIX</Label>
                <Input placeholder="Sua chave PIX" value={form.pixKey} onChange={(e) => handleChange("pixKey", e.target.value)} className="rounded-xl h-11" />
              </div>
            </div>

            <Button type="submit" className="w-full rounded-xl h-12 font-bold text-base bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? "Cadastrando..." : "Cadastrar como Entregador"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Já tem conta?{" "}
            <button onClick={() => navigate("/auth")} className="text-emerald-600 font-semibold">
              Faça login
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterDriver;
