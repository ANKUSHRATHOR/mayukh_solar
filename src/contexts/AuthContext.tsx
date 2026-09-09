import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { DEFAULT_ROLE_MODULES, type ModuleKey } from '@/lib/modules';

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
  permissions: Set<ModuleKey>;
  hasModule: (module: ModuleKey) => boolean;
  /**
   * The role the account actually holds. `role` above is what the UI should
   * render as, which differs only while an admin is previewing another role.
   */
  realRole: AppRole | null;
  /** Non-null while previewing. Admin-only, UI-only — see setViewAsRole. */
  viewAsRole: AppRole | null;
  setViewAsRole: (role: AppRole | null) => void;
  loading: boolean;
  profileResolved: boolean;
  /** The last profile fetch failed. Distinct from "this user has no role". */
  profileError: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

/**
 * Load the allowed modules for a role from role_permissions, falling back to the
 * in-code defaults when the table is missing/empty (e.g. migration not applied).
 * Admin always gets every module regardless of table contents.
 */
const loadPermissions = async (role: AppRole): Promise<Set<ModuleKey>> => {
  const fallback = () => new Set<ModuleKey>(DEFAULT_ROLE_MODULES[role] ?? []);
  try {
    // Cast: role_permissions postdates the last types.ts generation.
    const { data, error } = await (supabase as any)
      .from('role_permissions')
      .select('module, allowed')
      .eq('role', role);
    if (error || !data || data.length === 0) return fallback();
    return new Set<ModuleKey>(
      (data as { module: ModuleKey; allowed: boolean }[])
        .filter((r) => r.allowed)
        .map((r) => r.module)
    );
  } catch {
    return fallback();
  }
};

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

const VIEW_AS_KEY = 'view-as-role';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [permissions, setPermissions] = useState<Set<ModuleKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [profileResolved, setProfileResolved] = useState(false);
  const [profileError, setProfileError] = useState(false);

  /**
   * Role preview. Purely a rendering concern: RLS decides what the server
   * returns from auth.uid(), which this cannot touch, so previewing can never
   * grant access the account does not already have. It only answers "what does
   * this role's app look like?".
   *
   * Session-scoped rather than persisted, so it dies with the tab and cannot
   * quietly follow someone into tomorrow's session.
   */
  const [viewAsRole, setViewAsRoleState] = useState<AppRole | null>(() => {
    try {
      return (sessionStorage.getItem(VIEW_AS_KEY) as AppRole | null) ?? null;
    } catch {
      return null;
    }
  });
  const [viewAsPermissions, setViewAsPermissions] = useState<Set<ModuleKey> | null>(null);
  const lastUserId = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      setProfileResolved(false);
      setProfileError(false);

      // PostgREST reports failures in `error` rather than throwing, so reading
      // only `data` turned a timeout into `undefined` — indistinguishable from
      // "this user has no role". Under load that told an active admin their
      // account was pending approval.
      const { data: roleData, error: roleError } = await supabase.rpc('get_user_role', {
        _user_id: userId,
      });
      if (roleError) throw roleError;

      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, user_id, full_name, mobile, email, is_active, must_change_password, last_login')
        .eq('user_id', userId)
        .maybeSingle();
      if (staffError) throw staffError;

      const resolvedRole = (roleData as AppRole) ?? null;
      setRole(resolvedRole);
      setStaff(staffData ?? null);
      setPermissions(resolvedRole ? await loadPermissions(resolvedRole) : new Set());
    } catch (err) {
      console.error('Error fetching profile:', err);
      // Deliberately does NOT clear role/staff. This runs in the background on
      // TOKEN_REFRESHED and on window focus, so wiping the cached profile on a
      // transient failure is what made an already-loaded page fall back to
      // "Pending Approval". A user who genuinely has no role never had them set.
      setProfileError(true);
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
          setPermissions(new Set());
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
        setPermissions(new Set());
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
        setPermissions(new Set());
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
    setSession(null); setUser(null); setRole(null); setStaff(null); setPermissions(new Set()); setProfileResolved(true);
    setViewAsRoleState(null);
    try { sessionStorage.removeItem(VIEW_AS_KEY); } catch { /* private mode */ }
  };

  // Only an admin may preview, and only into a role that is not admin. A
  // non-admin flipping to "admin" would get admin chrome over data the server
  // still refuses — broken screens rather than a breach, but pointless.
  const setViewAsRole = (next: AppRole | null) => {
    if (role !== 'admin') return;
    const value = next === 'admin' ? null : next;
    setViewAsRoleState(value);
    try {
      if (value) sessionStorage.setItem(VIEW_AS_KEY, value);
      else sessionStorage.removeItem(VIEW_AS_KEY);
    } catch {
      /* private mode */
    }
  };

  // A preview is only meaningful for an admin; if the real role is anything
  // else, ignore whatever sessionStorage held.
  const previewing = role === 'admin' && viewAsRole !== null ? viewAsRole : null;
  const effectiveRole: AppRole | null = previewing ?? role;
  const effectivePermissions = previewing ? (viewAsPermissions ?? new Set<ModuleKey>()) : permissions;

  useEffect(() => {
    if (!previewing) {
      setViewAsPermissions(null);
      return;
    }
    let cancelled = false;
    loadPermissions(previewing).then((p) => {
      if (!cancelled) setViewAsPermissions(p);
    });
    return () => {
      cancelled = true;
    };
  }, [previewing]);

  const hasModule = (module: ModuleKey): boolean =>
    effectiveRole === 'admin' || effectivePermissions.has(module);

  return (
    <AuthContext.Provider value={{
      session,
      user,
      // Deliberately the effective role: every gate in the app already reads
      // `role`, so a preview needs no per-page changes. `realRole` is there for
      // the few places that must know the truth — the switcher itself.
      role: effectiveRole,
      realRole: role,
      viewAsRole: previewing,
      setViewAsRole,
      staff,
      permissions: effectivePermissions,
      hasModule,
      loading,
      profileResolved,
      profileError,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
