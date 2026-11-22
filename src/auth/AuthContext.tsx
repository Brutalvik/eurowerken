import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { ProfileRow } from '@/lib/supabase';
import { ACCESS } from './rbac';
import type { Access, ModuleId, Role } from './rbac';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  /** Null until a manager assigns a role. A user with no role can sign in but sees no modules. */
  role: Role | null;
  active: boolean;
}

/**
 * loading: checking the stored session or loading the profile
 * signed-out: no session
 * signed-in: session and profile loaded
 * recovery: the user arrived from a password reset email and must set a new password
 */
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'recovery';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Set when the profile could not be loaded, for example the profiles table is missing. */
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  reloadProfile: () => Promise<void>;
  accessFor: (module: ModuleId) => Access;
  /** True when the current role has at least the requested level on the module. */
  can: (module: ModuleId, level: 'view' | 'full') => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function toAuthUser(session: Session, profile: ProfileRow | null): AuthUser {
  const email = profile?.email ?? session.user.email ?? '';
  const name = profile?.full_name?.trim() || email.split('@')[0] || 'User';
  return {
    id: session.user.id,
    name,
    email,
    initials: initialsOf(name),
    role: profile?.active === false ? null : (profile?.role ?? null),
    active: profile?.active ?? true,
  };
}

/** Supabase returns English messages; keep them, but make the common one friendlier. */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Could not reach the sign-in server. Check your connection and try again.';
  }
  if (/email not confirmed/i.test(message)) return 'Confirm your email address first, using the link we sent you.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(!supabaseConfigured);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recovery, setRecovery] = useState(false);

  // Session: read the stored one, then follow sign-in, sign-out, token refresh and recovery events.
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setSessionChecked(true);
    });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // No awaited Supabase calls in here: the client holds a lock during this callback.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      setSession(next);
      setSessionChecked(true);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (id: string) => {
    setProfileLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) {
      setProfile(null);
      setProfileError(error.message);
    } else {
      setProfile(data as ProfileRow | null);
      setProfileError(null);
    }
    setProfileLoading(false);
  }, []);

  // Profile (name and role) for whoever is signed in. Only refetch when the user changes, not on token refresh.
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    void loadProfile(userId);
  }, [userId, loadProfile]);

  const user = useMemo(() => (session ? toAuthUser(session, profile) : null), [session, profile]);
  const role = user?.role ?? null;

  let status: AuthStatus;
  if (!sessionChecked || (session && profileLoading && !profile)) status = 'loading';
  else if (!session) status = 'signed-out';
  else if (recovery) status = 'recovery';
  else status = 'signed-in';

  const accessFor = useCallback((module: ModuleId): Access => (role ? ACCESS[role][module] : 'none'), [role]);

  const can = useCallback(
    (module: ModuleId, level: 'view' | 'full'): boolean => {
      if (!role) return false;
      const access = ACCESS[role][module];
      if (level === 'full') return access === 'full';
      return access === 'view' || access === 'full';
    },
    [role],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? friendly(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return error ? friendly(error.message) : null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return friendly(error.message);
    setRecovery(false);
    return null;
  }, []);

  const reloadProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profileError,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      reloadProfile,
      accessFor,
      can,
    }),
    [status, user, profileError, signIn, signOut, sendPasswordReset, updatePassword, reloadProfile, accessFor, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For components that only render inside the signed-in layout. */
export function useCurrentUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside a signed-in route');
  return user;
}
