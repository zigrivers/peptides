'use server';

import { auth } from '@/lib/auth';
import { requestDataExport } from '@/lib/auth/application/requestDataExport';

export interface RequestExportActionState {
  error?: string;
  success?: string;
}

/**
 * Server action wrapping the self-serve data export. Reads the userId from
 * the session (never from form data), so a caller cannot request another
 * user's export. The service throws domain errors that we translate to
 * user-friendly messages here.
 */
export async function requestExportAction(
  _prevState: RequestExportActionState | null,
  _formData: FormData
): Promise<RequestExportActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  try {
    await requestDataExport(session.user.id);
    return { success: 'Your data export has been emailed to you. It can take a few minutes to arrive.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    if (msg === 'user_not_found') return { error: 'Account not found.' };
    if (msg === 'export_too_large') {
      return {
        error:
          'Your export is too large to deliver by email. Please contact support — we will arrange an alternative delivery method.',
      };
    }
    if (msg === 'export_email_failed') {
      return { error: 'Failed to deliver the email. Please try again in a few minutes.' };
    }
    return { error: 'Something went wrong. Please try again.' };
  }
}
