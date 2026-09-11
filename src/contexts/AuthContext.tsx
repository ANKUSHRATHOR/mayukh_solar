import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { retryQuery } from '@/lib/retry';
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

type PermissionRow = { role: AppRole; module: ModuleKey; allowed: boolean };

/**
 * How long a resolved profile is treated as current. A window focus inside this
 * window reuses it instead of re-running the queries; a role changed
 * server-side still lands within a minute, or immediately on a reload.
 */
const PROFILE_TTL_MS = 60_000;

/**
 * Fewer, faster attempts than the default: this runs behind a full-screen
 * spinner, so each retry is time the user spends waiting rather than reading.
 */
const PROFILE_RETRY = { attempts: 2, baseDelayMs: 150 };

/** Picks one role's modules out of the whole table, falling back to the in-code defaults. */
const permissionsFor = (role: AppRole, rows: PermissionRow[] | null): Set<ModuleKey> => {
  const mine = (rows ?? []).filter((r) => r.role === role);
  if (mine.length === 0) return new Set<ModuleKey>(DEFAULT_ROLE_MODULES[role] ?? []);
  return new Set<ModuleKey>(mine.filter((r) => r.allowed).map((r) => r.module));
};

/**
 * Load the allowed modules for a role from role_permissions, falling back to the
 * in-code defaults when the table is missing/empty (e.g. migration not applied).
 * Admin always gets every module regardless of table contents.
 *
 * Only the role-preview path uses this now — the signed-in user's own modules
 * arrive with the profile batch rather than as a query of their own.
 */
const loadPermissions = async (role: AppRole): Promise<Set<ModuleKey>> => {
  try {
    // Cast: role_permissions postdates the last types.ts generation.
    const { data, error } = await retryQuery<{ data: PermissionRow[] | null; error: unknown }>(
      () => (supabase as any).from('role_permissions').select('role, module, allowed').eq('role', role),
    );
    return permissionsFor(role, error ? null : data);
  } catch {
    return permissionsFor(role, null);
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
  /** The fetch currently in flight, so concurrent callers join it rather than duplicating it. */
  const inFlight = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  /** When this user's profile last landed, so a focus event does not re-query it. */
  const freshFor = useRef<{ userId: string; at: number } | null>(null);

  const fetchProfile = (userId: string, { force = false }: { force?: boolean } = {}): Promise<void> => {
    // The auth listener fires INITIAL_SESSION at subscribe *and* on every
    // TOKEN_REFRESHED and window focus. Without these two guards the whole
    // three-query profile chain ran twice on a cold load and again every time
    // the tab regained focus, all of it behind ProtectedRoute's spinner.
    if (!force) {
      const current = inFlight.current;
      if (current && current.userId === userId) return current.promise;

      const fresh = freshFor.current;
      if (fresh && fresh.userId === userId && Date.now() - fresh.at < PROFILE_TTL_MS) {
        return Promise.resolve();
      }
    }

    // Only blank the gate when there is nothing cached for this user. A refresh
    // that sets this false mid-session sends ProtectedRoute back to its
    // full-screen spinner, unmounting whatever page the user was on.
    const isColdLoad = freshFor.current?.userId !== userId;

    const promise = (async () => {
      try {
        if (isColdLoad) setProfileResolved(false);
        setProfileError(false);

        // All three go out together. `get_user_role` and `staff` are keyed only
        // by userId, and role_permissions is readable in full by any
        // authenticated user, so none of them needs an earlier answer — they
        // used to run as three serial round trips with the app blocked behind
        // them.
        //
        // PostgREST reports failures in `error` rather than throwing, so reading
        // only `data` turned a timeout into `undefined` — indistinguishable from
        // "this user has no role". Under load that told an active admin their
        // account was pending approval.
        //
        // Retried, because this gate stands in front of the whole app: a single
        // transient 5xx drops the user on "Couldn't load your profile" and
        // latches there until they press Try again. Fewer attempts and a shorter
        // step than the default, because every one of them is time the user
        // spends looking at a spinner.
        const [roleRes, staffRes, permsRes] = await Promise.all([
          retryQuery(() => supabase.rpc('get_user_role', { _user_id: userId }), PROFILE_RETRY),
          retryQuery(
            () =>
              supabase
                .from('staff')
                .select('id, user_id, full_name, mobile, email, is_active, must_change_password, last_login')
                .eq('user_id', userId)
                .maybeSingle(),
            PROFILE_RETRY,
          ),
          retryQuery<{ data: PermissionRow[] | null; error: unknown }>(
            () => (supabase as any).from('role_permissions').select('role, module, allowed'),
            PROFILE_RETRY,
          ),
        ]);
        if (roleRes.error) throw roleRes.error;
        if (staffRes.error) throw staffRes.error;

        const resolvedRole = (roleRes.data as AppRole) ?? null;
        setRole(resolvedRole);
        setStaff(staffRes.data ?? null);
        // A failed permissions read is not a failed profile: it falls back to the
        // in-code defaults exactly as loadPermissions does.
        setPermissions(
          resolvedRole ? permissionsFor(resolvedRole, permsRes.error ? null : permsRes.data) : new Set(),
        );
        freshFor.current = { userId, at: Date.now() };
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
    })();

    inFlight.current = { userId, promise };
    void promise.finally(() => {
      if (inFlight.current?.promise === promise) inFlight.current = null;
    });
    return promise;
  };

  // The explicit Try again on the error screen must bypass both guards.
  const refreshProfile = async () => { if (user) await fetchProfile(user.id, { force: true }); };

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
          // Drop the freshness marker with the profile it describes, or the
          // next fetch would be skipped as "still current" and leave the new
          // user with no role at all.
          freshFor.current = null;
          inFlight.current = null;
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
        freshFor.current = null;
        inFlight.current = null;
      }
      setLoading(false);
    });

    // No getSession() fetch here on purpose. onAuthStateChange above fires
    // INITIAL_SESSION as soon as it subscribes, with the same session, and it
    // already starts the profile load — calling both is what made every cold
    // load run the whole chain twice. This only settles `loading` for the
    // signed-out case, which fires no auth event at all.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setProfileResolved(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try { await logEvent('logout'); } catch { /* noop */ }
    await supabase.auth.signOut();
    lastUserId.current = null;
    freshFor.current = null;
    inFlight.current = null;
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
