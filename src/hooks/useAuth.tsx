import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "super_admin" | "admin" | "editor" | "redator" | "user";
type Status = "pending" | "approved" | "rejected" | "blocked";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role | null;
  status: Status | null;
  isStaff: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setRole(null);
        setStatus(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchProfile(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchProfile(uid: string) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("user_id", uid)
        .single();
      
      if (data) {
        setRole(data.role as Role);
        setStatus(data.status as Status);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    } finally {
      setLoading(false);
    }
  }

  const FOUNDER_EMAIL = "thiagocbarreto@hotmail.com";
  const isAdmin = role === "admin" || role === "super_admin" || user?.email === FOUNDER_EMAIL;
  const isStaff = ["super_admin", "admin", "editor", "redator"].includes(role || "") || user?.email === FOUNDER_EMAIL;
  const isApproved = status === "approved" || user?.email === FOUNDER_EMAIL;

  return (
    <Ctx.Provider
      value={{
        user, session, role, status, isAdmin, isStaff, isApproved, loading,
        signOut: async () => { await supabase.auth.signOut(); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      user: null,
      session: null,
      role: null,
      status: null,
      isStaff: false,
      isAdmin: false,
      isApproved: false,
      loading: false,
      signOut: async () => {},
    } as AuthCtx;
  }
  return ctx;
}
