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
  acknowledgment_required: 'Please tick the "I understand" checkbox to confirm.',
  deletion_already_pending: 'Your account is already scheduled for deletion.',
  export_too_large: 'Your data export is too large to email automatically — please contact support.',
  export_email_failed: 'We could not deliver your data export. Please try again in a few minutes.',
  user_not_found: 'Account not found.',
  user_status_transition_failed: 'Your account is in an unexpected state. Please refresh and try again.',
  user_not_in_eligible_state: 'Your account is no longer eligible for immediate deletion. Please refresh.',
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

  const confirmEmail = String(formData.get('confirmEmail') ?? '');
  try {
    const { scheduledFor } = await requestSelfDeletion({
      userId: session.user.id,
      confirmEmail,
    });
    revalidatePath('/settings');
    revalidatePath('/dashboard');
    return {
      success:
        'Your account is scheduled for deletion in 48 hours. We emailed you a full data export. Sign in any time within the window to cancel.',
      scheduledFor: scheduledFor.toISOString(),
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'unknown_error';
    return { error: humanError(code) };
  }
}

export async function deleteImmediatelyAction(
  _prev: ScheduleDeletionState | null,
  formData: FormData
): Promise<ScheduleDeletionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: humanError('unauthorized') };

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
