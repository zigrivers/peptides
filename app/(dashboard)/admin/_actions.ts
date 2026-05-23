'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { deactivateManagedUser, triggerManagedUserPasswordReset } from '@/lib/admin/application/AdminService';

export interface AdminActionResult {
  error?: string;
  warning?: string;
  activeProtocolCount?: number;
  success?: string;
}

export async function deactivateManagedUserAction(
  managedUserId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult | null> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  if (session.user.role === 'MANAGED_USER') throw new Error('Forbidden');

  const confirmed = formData.get('confirmed') === 'true';
  try {
    const result = await deactivateManagedUser(session.user.id, managedUserId, confirmed);
    if (result.status === 'needs_confirmation') {
      return {
        warning: `This user has ${result.activeProtocolCount} active protocol${result.activeProtocolCount !== 1 ? 's' : ''}. Deactivating their account will prevent them from logging doses. Continue?`,
        activeProtocolCount: result.activeProtocolCount,
      };
    }
    revalidatePath('/admin', 'layout');
    return { success: 'User deactivated.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}

export async function triggerPasswordResetAction(
  managedUserId: string,
  _prevState: AdminActionResult | null,
  _formData: FormData
): Promise<AdminActionResult | null> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  if (session.user.role === 'MANAGED_USER') throw new Error('Forbidden');

  try {
    await triggerManagedUserPasswordReset(session.user.id, managedUserId);
    return { success: 'Password reset email sent.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong.' };
  }
}
