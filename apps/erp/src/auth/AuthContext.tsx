import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { ProfileRow, WorkshopRow } from '@/lib/supabase';
import { ACCESS, MODULE_ORDER, ROLES } from './rbac';
import type { Access, ModuleId, PermissionMatrix, Role } from './rbac';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  /** The workshop this account belongs to; null until they create or join one. */
  workshop: WorkshopRow | null;
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
  /** needsConfirmation is true when Supabase sent a confirmation email instead of signing the user in. */
  signUp: (input: SignUpInput) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  /**
   * Checks a 6-digit code from a sign-up or password reset email. On success
   * Supabase signs the user in; a recovery code also puts the app in recovery
   * so the user sets a new password next.
   */
  verifyCode: (email: string, code: string, type: 'signup' | 'recovery') => Promise<string | null>;
  /** Sends the sign-up confirmation email (with a new code) again. */
  resendSignupCode: (email: string, returnTo?: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  reloadProfile: () => Promise<void>;
  /** Workshop membership. Each returns an error message, or null on success. */
  createWorkshop: (name: string) => Promise<string | null>;
  requestJoin: (number: string) => Promise<string | null>;
  cancelJoinRequest: () => Promise<string | null>;
  acceptInvite: (token: string) => Promise<string | null>;
  workshopNumberExists: (number: string) => Promise<boolean>;
  /** Role permission matrix from public.role_permissions (falls back to the defaults in rbac.ts). */
  permissions: PermissionMatrix;
  reloadPermissions: () => Promise<void>;
  /** True once the permission matrix for the current workshop has loaded (or the defaults apply). */
  permissionsReady: boolean;
  accessFor: (module: ModuleId) => Access;
  /** True when the current role has at least the requested level on the module. */
  can: (module: ModuleId, level: 'view' | 'full') => boolean;
}

/** What the sign-up form collects. workshop is absent when joining through an invite link. */
export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
  workshop?: { action: 'create'; name: string } | { action: 'join'; number: string };
  /** Path the confirmation email returns to, for example /invite/abc. Defaults to /dashboard. */
  returnTo?: string;
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
    avatarUrl: profile?.avatar_url ?? null,
    workshop: profile?.workshop ?? null,
    role: profile?.active === false || !profile?.workshop ? null : (profile?.role ?? null),
    active: profile?.active ?? true,
  };
}

/** Shown when someone signs in before confirming their email. The sign-in page compares against it. */
export const EMAIL_NOT_CONFIRMED = 'Confirm your email address first. Enter the code we sent you, or open the link in the email.';

/** Supabase returns English messages; keep them, but make the common one friendlier. */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Could not reach the sign-in server. Check your connection and try again.';
  }
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Sign in instead.';
  if (/provider is not enabled|unsupported provider/i.test(message)) {
    return 'Google sign-in is not switched on yet in Supabase (Authentication, Providers, Google).';
  }
  if (/email not confirmed/i.test(message)) return EMAIL_NOT_CONFIRMED;
  if (/token has expired or is invalid|otp_expired|otp.*(expired|invalid)/i.test(message)) {
    return 'That code is wrong or has expired. Check the newest email, or send a new code.';
  }
  const wait = /only request this after (\d+) second/i.exec(message);
  if (wait) return `Wait ${wait[1]} seconds before asking for another code.`;
  if (/rate limit|too many requests/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(!supabaseConfigured);
  const [profileLoading, setProfileLoading] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [permissions, setPermissions] = useState<PermissionMatrix>(ACCESS);
  // The workshop the permission matrix was last loaded for (undefined: not yet).
  const [permissionsFor, setPermissionsFor] = useState<string | null | undefined>(undefined);

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
  const workshopId = profile?.workshop_id ?? null;

  const loadProfile = useCallback(async (id: string) => {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, workshop:workshops(id, name, number)')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      setProfile(null);
      setProfileError(error.message);
    } else {
      setProfile(data as ProfileRow | null);
      setProfileError(null);
    }
    setProfileLoading(false);
  }, []);

  const loadPermissions = useCallback(async () => {
    const { data, error } = await supabase.from('role_permissions').select('role, module, access');
    if (error || !data || data.length === 0) {
      // Table missing (migration 002 not applied yet) or unreadable: keep the built-in defaults.
      if (error) console.warn('Using default permissions:', error.message);
      setPermissions(ACCESS);
      return;
    }
    const next = Object.fromEntries(
      ROLES.map((r) => [r, Object.fromEntries(MODULE_ORDER.map((m) => [m, 'none' as Access]))]),
    ) as PermissionMatrix;
    for (const row of data as { role: Role; module: ModuleId; access: Access }[]) {
      if (next[row.role] && MODULE_ORDER.includes(row.module)) next[row.role][row.module] = row.access;
    }
    setPermissions(next);
  }, []);

  // Profile (name, role, workshop) for whoever is signed in. Only refetch when the user changes, not on token refresh.
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    void loadProfile(userId);
  }, [userId, loadProfile]);

  // The permission matrix belongs to the workshop, so reload it whenever the workshop changes.
  useEffect(() => {
    if (!workshopId) {
      setPermissions(ACCESS);
      setPermissionsFor(null);
      return;
    }
    let cancelled = false;
    void loadPermissions().then(() => {
      if (!cancelled) setPermissionsFor(workshopId);
    });
    return () => {
      cancelled = true;
    };
  }, [workshopId, loadPermissions]);

  const user = useMemo(() => (session ? toAuthUser(session, profile) : null), [session, profile]);
  const role = user?.role ?? null;

  let status: AuthStatus;
  if (!sessionChecked || (session && profileLoading && !profile)) status = 'loading';
  else if (!session) status = 'signed-out';
  else if (recovery) status = 'recovery';
  else status = 'signed-in';

  const permissionsReady = status === 'signed-in' && permissionsFor === workshopId;

  const accessFor = useCallback(
    (module: ModuleId): Access => (role ? permissions[role][module] : 'none'),
    [role, permissions],
  );

  const can = useCallback(
    (module: ModuleId, level: 'view' | 'full'): boolean => {
      if (!role) return false;
      const access = permissions[role][module];
      if (level === 'full') return access === 'full';
      return access === 'view' || access === 'full';
    },
    [role, permissions],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? friendly(error.message) : null;
  }, []);

  const signUp = useCallback(async ({ fullName, email, password, workshop, returnTo }: SignUpInput) => {
    // The database trigger reads workshop_action from this metadata to create or join the workshop.
    const metadata: Record<string, string> = { full_name: fullName.trim() };
    if (workshop?.action === 'create') {
      metadata.workshop_action = 'create';
      metadata.workshop_name = workshop.name.trim();
    } else if (workshop?.action === 'join') {
      metadata.workshop_action = 'join';
      metadata.workshop_number = workshop.number.trim();
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}${returnTo ?? '/dashboard'}`,
      },
    });
    if (error) return { error: friendly(error.message), needsConfirmation: false };
    // With "Confirm email" on, Supabase returns a user but no session. With an
    // existing address it also returns no session and an empty identities list.
    if (!data.session && data.user && data.user.identities?.length === 0) {
      return { error: 'An account with this email already exists. Sign in instead.', needsConfirmation: false };
    }
    return { error: null, needsConfirmation: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    // On success the browser leaves for Google, so only errors come back here.
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

  const verifyCode = useCallback(async (email: string, code: string, type: 'signup' | 'recovery') => {
    // Set recovery first: verifyOtp signs in before it returns, and the app
    // must never treat a reset as a normal sign-in.
    if (type === 'recovery') setRecovery(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type });
    if (error) {
      if (type === 'recovery') setRecovery(false);
      return friendly(error.message);
    }
    return null;
  }, []);

  const resendSignupCode = useCallback(async (email: string, returnTo?: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${returnTo ?? '/dashboard'}` },
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

  /** Runs a membership function, then reloads the profile so the app follows the new workshop. */
  const membership = useCallback(
    async (fn: string, args: Record<string, string>) => {
      const { error } = await supabase.rpc(fn, args);
      if (error) return friendly(error.message);
      await reloadProfile();
      return null;
    },
    [reloadProfile],
  );

  const createWorkshop = useCallback(
    (name: string) => membership('create_workshop', { p_name: name.trim() }),
    [membership],
  );
  const requestJoin = useCallback(
    (number: string) => membership('request_join', { p_number: number.trim() }),
    [membership],
  );
  const cancelJoinRequest = useCallback(() => membership('cancel_join_request', {}), [membership]);
  const acceptInvite = useCallback((token: string) => membership('accept_invite', { p_token: token }), [membership]);

  const workshopNumberExists = useCallback(async (number: string) => {
    const { data, error } = await supabase.rpc('workshop_number_exists', { p_number: number.trim() });
    return !error && data === true;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profileError,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      sendPasswordReset,
      verifyCode,
      resendSignupCode,
      updatePassword,
      reloadProfile,
      createWorkshop,
      requestJoin,
      cancelJoinRequest,
      acceptInvite,
      workshopNumberExists,
      permissions,
      reloadPermissions: loadPermissions,
      permissionsReady,
      accessFor,
      can,
    }),
    [
      status,
      user,
      profileError,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      sendPasswordReset,
      verifyCode,
      resendSignupCode,
      updatePassword,
      reloadProfile,
      createWorkshop,
      requestJoin,
      cancelJoinRequest,
      acceptInvite,
      workshopNumberExists,
      permissions,
      loadPermissions,
      permissionsReady,
      accessFor,
      can,
    ],
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
