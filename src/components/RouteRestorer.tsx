import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "lastRoute";

// Routes that should NOT be saved/restored (auth flows, etc.)
const EXCLUDED_ROUTES = ["/auth", "/admin/login", "/cadastro/cliente", "/cadastro/entregador", "/cadastro/lojista"];
const PROTECTED_PANEL_ROUTES = ["/admin", "/lojista", "/entregador"];

const isExcludedRoute = (path: string) =>
  EXCLUDED_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

const isProtectedPanelRoute = (path: string) =>
  PROTECTED_PANEL_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

const RouteRestorer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Save current route on every navigation
  useEffect(() => {
    const path = location.pathname + location.search;
    if (!isExcludedRoute(location.pathname) && (!isProtectedPanelRoute(location.pathname) || user)) {
      localStorage.setItem(STORAGE_KEY, path);
    }
  }, [location, user]);

  // On first mount, restore saved route
  useEffect(() => {
    if (loading) return;
    if (isExcludedRoute(location.pathname)) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (
      saved &&
      saved !== "/" &&
      saved !== location.pathname &&
      !isExcludedRoute(saved) &&
      (!isProtectedPanelRoute(saved) || user)
    ) {
      navigate(saved, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return null;
};

export default RouteRestorer;
