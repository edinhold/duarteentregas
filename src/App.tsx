import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LoadScript } from "@react-google-maps/api";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { GOOGLE_MAPS_API_KEY } from "@/config/maps";
import Index from "./pages/Index";
import RestaurantDetail from "./pages/RestaurantDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Auth from "./pages/Auth";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import StoreOwnerPanel from "./pages/StoreOwnerPanel";
import DriverPanel from "./pages/DriverPanel";
import RegisterCustomer from "./pages/register/RegisterCustomer";
import RegisterDriver from "./pages/register/RegisterDriver";
import RegisterStoreOwner from "./pages/register/RegisterStoreOwner";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const hasMapsKey = GOOGLE_MAPS_API_KEY !== "YOUR_GOOGLE_MAPS_API_KEY" as string;

const AppContent = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/restaurant/:id" element={<RestaurantDetail />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/cadastro/cliente" element={<RegisterCustomer />} />
              <Route path="/cadastro/entregador" element={<RegisterDriver />} />
              <Route path="/cadastro/lojista" element={<RegisterStoreOwner />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/lojista" element={<StoreOwnerPanel />} />
              <Route path="/entregador" element={<DriverPanel />} />
              <Route path="/instalar" element={<Install />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

const App = () => {
  if (hasMapsKey) {
    return (
      <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
        <AppContent />
      </LoadScript>
    );
  }
  return <AppContent />;
};

export default App;
