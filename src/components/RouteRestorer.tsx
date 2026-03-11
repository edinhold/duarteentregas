import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const STORAGE_KEY = "lastRoute";

// Routes that should NOT be restored (auth flows, etc.)
const EXCLUDED_ROUTES = ["/auth", "/admin/login", "/cadastro/cliente", "/cadastro/entregador", "/cadastro/lojista"];

const RouteRestorer = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Save current route on every navigation
  useEffect(() => {
    const path = location.pathname + location.search;
    if (!EXCLUDED_ROUTES.includes(location.pathname)) {
      localStorage.setItem(STORAGE_KEY, path);
    }
  }, [location]);

  // On first mount, restore saved route
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== "/" && saved !== location.pathname && !EXCLUDED_ROUTES.includes(saved)) {
      navigate(saved, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default RouteRestorer;
