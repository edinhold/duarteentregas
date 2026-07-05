import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const STORAGE_KEY = "lastRoute";

// Routes that should NOT be saved/restored (auth flows, etc.)
const EXCLUDED_ROUTES = ["/auth", "/admin/login", "/cadastro/cliente", "/cadastro/entregador", "/cadastro/lojista"];

const isExcludedRoute = (path: string) =>
  EXCLUDED_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

const RouteRestorer = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Save current route on every navigation
  useEffect(() => {
    const path = location.pathname + location.search;
    if (!isExcludedRoute(location.pathname)) {
      localStorage.setItem(STORAGE_KEY, path);
    }
  }, [location]);

  // On first mount, restore saved route
  useEffect(() => {
    if (isExcludedRoute(location.pathname)) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== "/" && saved !== location.pathname && !isExcludedRoute(saved)) {
      navigate(saved, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default RouteRestorer;
