import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { CustomerAccountRow } from '@eurowerken/shared';
import { friendlyError } from '@/lib/errors';
import { supabase, supabaseConfigured } from '@/lib/supabase';

/** customer_accounts row, with the notification preferences added in migration 006. */
export interface CustomerAccount extends CustomerAccountRow {
  notify_email: boolean;
  notify_sms: boolean;
}

/** The columns a customer may change (migration 006 grants update on these only). */
export type AccountPatch = Partial<Pick<CustomerAccount, 'full_name' | 'phone' | 'avatar_url' | 'notify_email' | 'notify_sms'>>;

/**
 * loading: checking the stored session or loading the account
 * signed-out: no session
 * signed-in: session and account loaded (account may be null with accountError set)
 * recovery: arrived from a password reset email; must set a new password
 */
export type CustomerAuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'recovery';

export interface SignUpInput {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}

interface CustomerAuthValue {
  status: CustomerAuthStatus;
  account: CustomerAccount | null;
  /** Set when the account could not be set up or loaded. */
  accountError: string | null;
  /** Display name: full name, or the part of the email before the @. */
  displayName: string;
  initials: string;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** needsConfirmation is true when Supabase sent a confirmation email instead of signing in. */
  signUp: (input: SignUpInput) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  /** next: site path to return to after Google (defaults to the garage). */
  signInWithGoogle: (next?: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  /**
   * Checks a 6-digit code from a sign-up or password reset email. On success
   * Supabase signs the user in; a recovery code also puts the site in
   * recovery so the user sets a new password next.
   */
  verifyCode: (email: string, code: string, type: 'signup' | 'recovery') => Promise<string | null>;
  /** Sends the sign-up confirmation email (with a new code) again. */
  resendSignupCode: (email: string) => Promise<string | null>;
  /** Account setup after a sign-in: the account exists, and it is linked to this workshop. */
  setupProgress: SetupProgress;
  updatePassword: (password: string) => Promise<string | null>;
  /** Saves at once on screen, then rolls back the changed fields if the save fails. */
  updateAccount: (patch: AccountPatch) => Promise<string | null>;
  reload: () => void;
}

export interface SetupProgress {
  account: boolean;
  linked: boolean;
}

const NO_SETUP: SetupProgress = { account: false, linked: false };
const SETUP_DONE: SetupProgress = { account: true, linked: true };

const ACCOUNT_COLUMNS = 'id, email, full_name, phone, avatar_url, notify_email, notify_sms, created_at';
const LINKED_PREFIX = 'ew-customer-linked';

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

/*
 * PASSWORD_RECOVERY fires while the client reads the reset link from the URL,
 * which can happen before the site (and this provider) has loaded. Listen from
 * module load so the event is never missed.
 */
let recoveryPending = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash);
const recoveryListeners = new Set<(value: boolean) => void>();
function setRecoveryPending(value: boolean) {
  recoveryPending = value;
  recoveryListeners.forEach((fn) => fn(value));
}
if (supabaseConfigured) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') setRecoveryPending(true);
    if (event === 'SIGNED_OUT') setRecoveryPending(false);
  });
}

function sessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function setSessionFlag(key: string) {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    // Private mode without storage: linking simply runs again next time.
  }
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/**
 * A path to return to after signing in, limited to this site. Anything else
 * (other sites, absolute URLs, the auth pages themselves) falls back to the garage.
 */
export function safeNext(next: string | null | undefined, slug: string): string {
  const fallback = `/${slug}/garage`;
  // A relative path on this site only: no scheme, no protocol-relative //, no backslashes, no whitespace or control characters.
  if (!next || next.length > 512 || !next.startsWith('/') || next.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/.test(next)) return fallback;
  const base = `/${slug}`;
  if (next !== base && !['/', '?', '#'].some((c) => next.startsWith(`${base}${c}`))) return fallback;
  if (/^\/[^/]+\/(login|register|reset-password)(\/|\?|#|$)/.test(next)) return fallback;
  return next;
}

export function CustomerAuthProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(!supabaseConfigured);
  const [recovery, setRecovery] = useState(recoveryPending);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [setupProgress, setSetupProgress] = useState<SetupProgress>(NO_SETUP);
  const accountRef = useRef<CustomerAccount | null>(null);
  accountRef.current = account;

  useEffect(() => {
    recoveryListeners.add(setRecovery);
    setRecovery(recoveryPending);
    return () => {
      recoveryListeners.delete(setRecovery);
    };
  }, []);

  // Session: the stored one, then sign-in, sign-out and token refresh events.
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // No awaited Supabase calls in here: the client holds a lock during this callback.
      setSession(next);
      setSessionChecked(true);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  // After any sign-in: make sure the customer account exists and is linked to
  // this workshop (once per browser session and site), then load it.
  useEffect(() => {
    if (!userId) {
      setAccount(null);
      setAccountError(null);
      setLoadedFor(null);
      setSetupProgress(NO_SETUP);
      return;
    }
    let cancelled = false;
    void (async () => {
      const linkedKey = `${LINKED_PREFIX}:${userId}:${slug}`;
      let setupError: string | null = null;
      if (!sessionFlag(linkedKey)) {
        setSetupProgress(NO_SETUP);
        const ensured = await supabase.rpc('ensure_customer_account');
        if (cancelled) return;
        if (ensured.error) {
          setupError = friendlyError(ensured.error.message);
          // The step is over either way; the error shows on the account pages.
          setSetupProgress(SETUP_DONE);
        } else {
          setSetupProgress({ account: true, linked: false });
          const linked = await supabase.rpc('link_customer_to_workshop', { p_slug: slug });
          if (linked.error) setupError = friendlyError(linked.error.message);
          else setSessionFlag(linkedKey);
          if (cancelled) return;
          setSetupProgress(SETUP_DONE);
        }
      } else {
        setSetupProgress(SETUP_DONE);
      }
      const { data, error } = await supabase.from('customer_accounts').select(ACCOUNT_COLUMNS).eq('id', userId).maybeSingle();
      if (cancelled) return;
      if (error) {
        setAccount(null);
        setAccountError(friendlyError(error.message));
      } else if (!data) {
        setAccount(null);
        setAccountError(setupError ?? 'Your customer account could not be set up. Try again in a moment.');
      } else {
        setAccount(data as CustomerAccount);
        setAccountError(null);
      }
      setLoadedFor(userId);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, slug, nonce]);

  let status: CustomerAuthStatus;
  if (!sessionChecked || (session && loadedFor !== userId)) status = 'loading';
  else if (!session) status = 'signed-out';
  else if (recovery) status = 'recovery';
  else status = 'signed-in';

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? friendlyError(error.message) : null;
  }, []);

  const signUp = useCallback(
    async ({ fullName, email, phone, password }: SignUpInput) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // handle_new_user reads account_type to create a customer account (no staff profile).
          data: { account_type: 'customer', full_name: fullName.trim(), phone: phone?.trim() ?? '' },
          emailRedirectTo: `${window.location.origin}/${slug}/garage`,
        },
      });
      if (error) return { error: friendlyError(error.message), needsConfirmation: false };
      // An existing address returns no session and an empty identities list.
      if (!data.session && data.user && data.user.identities?.length === 0) {
        return { error: 'An account with this email already exists. Sign in instead.', needsConfirmation: false };
      }
      return { error: null, needsConfirmation: !data.session };
    },
    [slug],
  );

  const signInWithGoogle = useCallback(
    async (next?: string) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${safeNext(next, slug)}` },
      });
      // On success the browser leaves for Google, so only errors come back here.
      return error ? friendlyError(error.message) : null;
    },
    [slug],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/${slug}/reset-password`,
      });
      return error ? friendlyError(error.message) : null;
    },
    [slug],
  );

  const verifyCode = useCallback(async (email: string, code: string, type: 'signup' | 'recovery') => {
    // Set recovery first: verifyOtp signs in before it returns, and the site
    // must never treat a reset as a normal sign-in.
    if (type === 'recovery') setRecoveryPending(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type });
    if (error) {
      if (type === 'recovery') setRecoveryPending(false);
      return friendlyError(error.message);
    }
    return null;
  }, []);

  const resendSignupCode = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/${slug}/garage` },
      });
      return error ? friendlyError(error.message) : null;
    },
    [slug],
  );

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return friendlyError(error.message);
    setRecoveryPending(false);
    return null;
  }, []);

  const updateAccount = useCallback(async (patch: AccountPatch) => {
    const before = accountRef.current;
    if (!before) return 'Sign in first.';
    const keys = Object.keys(patch) as (keyof AccountPatch)[];
    setAccount((cur) => (cur ? { ...cur, ...patch } : cur));
    const { data, error } = await supabase
      .from('customer_accounts')
      .update(patch)
      .eq('id', before.id)
      .select(ACCOUNT_COLUMNS)
      .single();
    if (error) {
      // Put back only the fields this call changed, so other saves are kept.
      setAccount((cur) => {
        if (!cur) return cur;
        const restored: CustomerAccount = { ...cur };
        for (const k of keys) (restored as unknown as Record<string, unknown>)[k] = before[k];
        return restored;
      });
      return friendlyError(error.message);
    }
    setAccount(data as CustomerAccount);
    return null;
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const email = account?.email ?? session?.user.email ?? '';
  const displayName = account?.full_name?.trim() || email.split('@')[0] || 'there';

  const value = useMemo<CustomerAuthValue>(
    () => ({
      status,
      account,
      accountError,
      displayName,
      initials: initialsOf(displayName),
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      sendPasswordReset,
      verifyCode,
      resendSignupCode,
      setupProgress,
      updatePassword,
      updateAccount,
      reload,
    }),
    [
      status,
      account,
      accountError,
      displayName,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      sendPasswordReset,
      verifyCode,
      resendSignupCode,
      setupProgress,
      updatePassword,
      updateAccount,
      reload,
    ],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider');
  return ctx;
}
