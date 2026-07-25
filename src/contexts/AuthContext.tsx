import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { setOneSignalExternalUserId, clearOneSignalExternalUserId, registerDeviceForUser } from "@/lib/onesignal";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      // Fetch role and fully register the device on OneSignal + sync to Supabase
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      handleUser(session?.user?.id);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      handleUser(session?.user?.id);
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
