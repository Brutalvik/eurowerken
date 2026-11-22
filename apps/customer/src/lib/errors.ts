/** Shown when someone signs in before confirming their email. The sign-in page compares against it. */
export const EMAIL_NOT_CONFIRMED = 'Confirm your email address first. Enter the code we sent you, or open the link in the email.';

/**
 * Supabase returns English messages. Keep them, but make the common ones
 * friendlier (mirrors the staff app). Never pass tokens or passwords in here.
 */
export function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Sign in instead.';
  if (/provider is not enabled|unsupported provider/i.test(message)) {
    return 'Google sign-in is not switched on for this site yet. Use your email and a password instead.';
  }
  if (/email not confirmed/i.test(message)) return EMAIL_NOT_CONFIRMED;
  if (/token has expired or is invalid|otp_expired|otp.*(expired|invalid)/i.test(message)) {
    return 'That code is wrong or has expired. Check the newest email, or send a new code.';
  }
  const wait = /only request this after (\d+) second/i.exec(message);
  if (wait) return `Wait ${wait[1]} seconds before asking for another code.`;
  if (/reauthenticat|recent(ly)? (sign|log)/i.test(message)) {
    return 'For your security, sign out and sign in again, then change your password.';
  }
  if (/rate limit|too many requests/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
  if (/violates check constraint/i.test(message)) return 'Some details are not valid. Check the form and try again.';
  return message;
}
