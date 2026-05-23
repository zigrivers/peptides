'use server';

import { acceptInvite } from '@/lib/auth/application/acceptInvite';

export interface AcceptInviteActionState {
  error?: string;
}

/**
 * Server action for the /accept-invite page form.
 *
 * Note: NextAuth's `signIn()` server-side throws a NEXT_REDIRECT internally
 * to navigate; we do NOT auto-sign-in here to keep the action focused on
 * the invite-acceptance side-effect. After success, the page redirects the
 * user to /login?email=<their-email>&accepted=1 so they can complete sign-in
 * with the password they just set. This avoids the well-known
 * "cannot redirect inside try/catch" pitfall with server-action sign-in
 * and keeps the auth surface explicit.
 */
export async function acceptInviteAction(
  rawToken: string,
  _prevState: AcceptInviteActionState | null,
  formData: FormData
): Promise<AcceptInviteActionState> {
  const name = (formData.get('name') as string | null)?.toString() ?? '';
  const password = (formData.get('password') as string | null)?.toString() ?? '';
  const confirmPassword = (formData.get('confirmPassword') as string | null)?.toString() ?? '';
  const acknowledged = formData.get('acknowledged') === 'true';

  if (!acknowledged) {
    return { error: 'You must acknowledge the arrangement to continue.' };
  }
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  try {
    await acceptInvite({ rawToken, name, password });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    switch (msg) {
      case 'invite_not_found':
      case 'invite_revoked':
      case 'invite_no_longer_valid':
        return { error: 'This invitation link is not valid.' };
      case 'invite_already_used':
        return { error: 'This invitation has already been used. Please sign in instead.' };
      case 'invite_expired':
        return { error: 'This invitation has expired. Ask your administrator to resend it.' };
      case 'email_already_in_use':
        return { error: 'An account with this email already exists. Please sign in instead.' };
      case 'password_too_short':
        return { error: 'Password must be at least 8 characters.' };
      case 'name_required':
        return { error: 'Please enter your name.' };
      default:
        return { error: 'Something went wrong. Please try again.' };
    }
  }

  // Caller redirects to /login on success — Next.js redirect() doesn't work
  // cleanly inside a try/catch in a server action, so we signal success by
  // returning a state with no error and a marker the page can check.
  return {};
}
