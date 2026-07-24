import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface StaffProfile {
  id: string;
  user_id: string;
  full_name: string;
  mobile: string;
  email: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  staff: StaffProfile | null;
  loading: boolean;
  profileResolved: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const logEvent = async (action: 'login' | 'logout') => {
  try {
    await supabase.rpc('log_user_event' as any, {
      _action: action,
      _meta: {
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        platform: typeof navigator !== 'undefined' ? (navigator as any).platform : null,
        language: typeof navigator !== 'undefined' ? navigator.language : null,
        screen: typeof window !== 'undefined' ? `${window.screen?.width}x${window.screen?.height}` : null,
        at: new Date().toISOString(),
      },
    });
  } catch {
    // best-effort, never block auth
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileResolved, setProfileResolved] = useState(false);
  const lastUserId = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      setProfileResolved(false);
      const { data: roleData } = await supabase.rpc('get_user_role', { _user_id: userId });
      setRole(roleData as AppRole);
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, user_id, full_name, mobile, email, is_active, must_change_password, last_login')
        .eq('user_id', userId)
        .maybeSingle();
      setStaff(staffData ?? null);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setRole(null);
      setStaff(null);
    } finally {
      setProfileResolved(true);
    }
  };

  const refreshProfile = async () => { if (user) await fetchProfile(user.id); };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const uid = session.user.id;
        const isDifferentUser = lastUserId.current !== null && lastUserId.current !== uid;

        // Only tear down the cached profile when the signed-in user actually
        // changes. This handler also fires on TOKEN_REFRESHED and on window
        // focus; clearing role/staff there made ProtectedRoute either flash
        // "Pending Approval" (profileResolved left true) or unmount the whole
        // page mid-interaction (profileResolved set false) — the latter closed
        // any open dialog and lost its state.
        if (isDifferentUser) {
          setRole(null);
          setStaff(null);
          setProfileResolved(false);
        }

        // Always refresh in the background so a role change picked up
        // server-side lands without a manual reload.
        setTimeout(() => fetchProfile(uid), 0);

        if (event === 'SIGNED_IN' && lastUserId.current !== uid) {
          lastUserId.current = uid;
          setTimeout(() => logEvent('login'), 0);
        }
        lastUserId.current = uid;
      } else {
        if (lastUserId.current) {
          setTimeout(() => logEvent('logout'), 0);
          lastUserId.current = null;
        }
        setRole(null);
        setStaff(null);
        setProfileResolved(true);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        lastUserId.current = session.user.id;
        setRole(null);
        setStaff(null);
        fetchProfile(session.user.id);
      } else {
        setProfileResolved(true);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try { await logEvent('logout'); } catch { /* noop */ }
    await supabase.auth.signOut();
    lastUserId.current = null;
    setSession(null); setUser(null); setRole(null); setStaff(null); setProfileResolved(true);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, staff, loading, profileResolved, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
