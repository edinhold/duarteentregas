import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { setOneSignalExternalUserId, clearOneSignalExternalUserId, registerDeviceForUser } from "@/lib/onesignal";

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
  // Guards against double initialization (React StrictMode / remounts):
  // only ONE getSession() + ONE onAuthStateChange listener may exist.
  const initializedRef = useRef(false);


  useEffect(() => {
    // Track last processed uid + access token to avoid re-running side effects
    // for duplicate auth events (INITIAL_SESSION + SIGNED_IN + TOKEN_REFRESHED
    // all fire and each carries a fresh object reference, which was causing
    // downstream effects that depend on `user` to re-run in a loop).
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
          try { await clearOneSignalExternalUserId(); } catch {}
          await supabase.auth.signOut();
          return true;
        }
      } catch {}
      return false;
    };

    const handleUser = async (uid: string | undefined) => {
      if (!uid) {
        clearOneSignalExternalUserId().catch(() => {});
        return;
      }
      const suspended = await enforceSuspension();
      if (suspended) return;
      setOneSignalExternalUserId(uid).catch(() => {});
      try {
        const { data: roles } = await (supabase as any)
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        const role = Array.isArray(roles) && roles.length > 0 ? String(roles[0].role) : "customer";
        registerDeviceForUser(uid, { role }).catch(() => {});
      } catch {
        registerDeviceForUser(uid, {}).catch(() => {});
      }
    };

    const apply = (nextSession: Session | null, source: string) => {
      const uid = nextSession?.user?.id ?? null;
      const token = nextSession?.access_token ?? null;
      const sameUser = uid === lastUid;
      const sameToken = token === lastToken;

      // Always clear loading on the first signal so UI doesn't hang.
      if (!handled) {
        handled = true;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
        lastUid = uid;
        lastToken = token;
        console.log("[Auth] Sessão inicial", { source, uid });
        handleUser(uid ?? undefined);
        return;
      }

      if (sameUser && sameToken) {
        // Duplicate event (e.g. INITIAL_SESSION after getSession): skip.
        return;
      }

      setSession(nextSession);
      // Only swap the user object reference when the uid actually changes,
      // so downstream `useEffect([user])` doesn't re-fire on token refresh.
      if (!sameUser) {
        setUser(nextSession?.user ?? null);
        console.log("[Auth] Sessão alterada", { source, uid });
        handleUser(uid ?? undefined);
      }
      lastUid = uid;
      lastToken = token;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      apply(session, `event:${event}`);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      apply(session, "getSession");
    });

    return () => subscription.unsubscribe();
  }, []);



  const signOut = async () => {
    try { await clearOneSignalExternalUserId(); } catch {}
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
