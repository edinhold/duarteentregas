import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { safeSessionStorage } from "@/lib/safeStorage";

export type AppRole = "admin" | "store_owner" | "driver" | "customer";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  roleLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    console.log("[App:auth]", "AuthProvider inicializado");

    let lastUid: string | null | undefined = undefined;
    let lastToken: string | null | undefined = undefined;
    let handled = false;

    const enforceSuspension = async () => {
      try {
        const { data } = await (supabase as any).rpc("get_my_suspension");
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.suspended_until && new Date(row.suspended_until).getTime() > Date.now()) {
          const until = new Date(row.suspended_until).toLocaleString("pt-BR");
          const reason = row.suspension_reason ? `\nMotivo: ${row.suspension_reason}` : "";
          alert(`Sua conta está suspensa até ${until}.${reason}`);
          await supabase.auth.signOut();
          return true;
        }
      } catch (err) {
        console.warn("[App:auth] Falha ao verificar suspensão:", err);
      }
      return false;
    };

    const resolveRole = async (uid: string): Promise<AppRole> => {
      try {
        const { data: roles } = await (supabase as any)
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        const list: string[] = Array.isArray(roles) ? roles.map((r: any) => String(r.role)) : [];
        if (list.includes("admin")) return "admin";
        if (list.includes("store_owner")) return "store_owner";
        if (list.includes("driver")) return "driver";

        const [{ data: driverProfile }, { data: ownedRest }] = await Promise.all([
          supabase.from("drivers").select("id").eq("user_id", uid).maybeSingle(),
          supabase.from("restaurants").select("id").eq("owner_id", uid).maybeSingle(),
        ]);
        if (driverProfile) {
          await supabase.from("user_roles").insert({ user_id: uid, role: "driver" as any }).then(() => {}, () => {});
          return "driver";
        }
        if (ownedRest) {
          await supabase.from("user_roles").insert({ user_id: uid, role: "store_owner" as any }).then(() => {}, () => {});
          return "store_owner";
        }
      } catch (err) {
        console.warn("[App:auth] Falha ao resolver role:", err);
      }
      return "customer";
    };

    const handleUser = async (uid: string | undefined) => {
      if (!uid) {
        setRole(null);
        setRoleLoading(false);
        return;
      }
      setRoleLoading(true);
      try {
        const suspended = await enforceSuspension();
        if (suspended) {
          setRole(null);
          return;
        }
        const resolved = await resolveRole(uid);
        console.log("[App:auth]", "Role carregada:", resolved);
        setRole(resolved);
      } catch (err) {
        console.error("[App:auth] Erro ao carregar dados do usuário:", err);
        setRole("customer");
      } finally {
        setRoleLoading(false);
      }
    };

    const apply = (nextSession: Session | null, source: string) => {
      const uid = nextSession?.user?.id ?? null;
      const token = nextSession?.access_token ?? null;
      const sameUser = uid === lastUid;
      const sameToken = token === lastToken;

      if (!handled) {
        handled = true;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
        lastUid = uid;
        lastToken = token;
        console.log("[App:auth]", "Sessão inicial estabelecida:", { source, uid });
        handleUser(uid ?? undefined);
        return;
      }

      if (sameUser && sameToken) {
        return;
      }

      setSession(nextSession);
      if (!sameUser) {
        setUser(nextSession?.user ?? null);
        console.log("[App:auth]", "Sessão alterada:", { source, uid });
        handleUser(uid ?? undefined);
      }
      lastUid = uid;
      lastToken = token;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[App:auth]", "onAuthStateChange:", event);
      apply(session, `event:${event}`);
    });

    console.log("[App:auth]", "Recuperando sessão do Supabase");
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        apply(session, "getSession");
      })
      .catch((err) => {
        console.error("[App:auth] Erro ao recuperar sessão do Supabase:", err);
        apply(null, "getSession:error");
      });

    // Timer de segurança de 4s para garantir que loading nunca fique trancado
    const safetyTimer = setTimeout(() => {
      if (!handled) {
        console.warn("[App:auth] Timeout de recuperação de sessão atingido, liberando interface");
        apply(null, "getSession:timeout");
      }
    }, 4000);

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
      console.log("[App:auth]", "Listener de autenticação desinstalado");
    };
  }, []);

  const signOut = async () => {
    safeSessionStorage.removeItem("authRedirectDone");
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, roleLoading, signOut }}>

      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
