'use server';

import { revalidatePath } from 'next/cache';
import { signOut } from '@/lib/auth';
import { auth } from '@/lib/auth';
import {
  requestSelfDeletion,
  requestImmediateDeletion,
} from '@/lib/auth/application/scheduleAccountDeletion';

export interface ScheduleDeletionState {
  error?: string;
  success?: string;
  scheduledFor?: string;
}

const HUMAN_ERRORS: Record<string, string> = {
  unauthorized: 'Please sign in again.',
  email_mismatch: 'The email you entered does not match the email on your account.',
  confirm_text_mismatch: 'Please type DELETE exactly to confirm deletion.',
  acknowledgment_required: 'Please tick the "I understand" checkbox to confirm.',
  deletion_already_pending: 'Your account is already scheduled for deletion.',
  export_too_large: 'Your data export is too large to email automatically — please contact support.',
  export_email_failed: 'We could not deliver your data export. Please try again in a few minutes.',
  user_not_found: 'Account not found.',
  user_status_transition_failed: 'Your account is in an unexpected state. Please refresh and try again.',
  user_not_in_eligible_state: 'Your account is no longer eligible for immediate deletion. Please refresh.',
  managed_user_cannot_self_delete:
    'Managed accounts cannot be deleted directly. Please contact the Power User who manages your account.',
  has_managed_users:
    'You manage other accounts on this app. Please transfer or delete them in the Admin panel before deleting your own account.',
};

function humanError(code: string): string {
  return HUMAN_ERRORS[code] ?? 'Something went wrong. Please try again.';
}

export async function scheduleDeletionAction(
  _prev: ScheduleDeletionState | null,
  formData: FormData
): Promise<ScheduleDeletionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: humanError('unauthorized') };

  const confirmText = String(formData.get('confirmText') ?? '');
  if (confirmText.trim().toUpperCase() !== 'DELETE') {
    return { error: humanError('confirm_text_mismatch') };
  }

  const confirmEmail = String(formData.get('confirmEmail') ?? '');
  try {
    await requestSelfDeletion({
      userId: session.user.id,
      confirmEmail,
    });
    revalidatePath('/settings');
    revalidatePath('/dashboard');
  } catch (err) {
    const code = err instanceof Error ? err.message : 'unknown_error';
    return { error: humanError(code) };
  }
  // Sign the user out so the next request is forced through fresh
  // authentication, which surfaces the new DELETION_PENDING status. The
  // JWT cookie embeds `status`, and middleware uses it to constrain
  // navigation. Without this sign-out, the user's existing JWT would
  // still claim `status: 'ACTIVE'` until the next jwt-callback refresh,
  // allowing a brief window of normal dashboard access right after the
  // export email was generated. signOut throws a redirect — let it.
  await signOut({ redirectTo: '/login?deletionScheduled=1' });
  // Unreachable in practice; satisfies the return-type contract.
  return {
    success:
      'Your account is scheduled for deletion in 48 hours. We emailed you a full data export. Sign in any time within the window to cancel.',
  };
}

export async function deleteImmediatelyAction(
  _prev: ScheduleDeletionState | null,
  formData: FormData
): Promise<ScheduleDeletionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: humanError('unauthorized') };

  const confirmText = String(formData.get('confirmText') ?? '');
  if (confirmText.trim().toUpperCase() !== 'DELETE') {
    return { error: humanError('confirm_text_mismatch') };
  }

  const confirmEmail = String(formData.get('confirmEmail') ?? '');
  const acknowledged = formData.get('acknowledged') === 'on';
  try {
    await requestImmediateDeletion({
      userId: session.user.id,
      confirmEmail,
      acknowledged,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'unknown_error';
    return { error: humanError(code) };
  }
  // After successful deletion, sign the user out so the now-stale session
  // cookie is cleared and the browser is redirected. signOut throws a
  // redirect — let it propagate so Next.js performs the navigation.
  await signOut({ redirectTo: '/' });
  // Unreachable: signOut always throws (the redirect). Returning here only
  // to satisfy the type system in the event Next.js ever changes signOut
  // to no-op on the server.
  return { success: 'Your account has been deleted.' };
}
