import { EmailChangeToken } from '@/lib/auth/domain/EmailChangeToken';
import { EmailChangeRepo } from '@/lib/auth/infrastructure/EmailChangeRepo';
import { withAudit } from '@/lib/audit/application/withAudit';

export interface RevertEmailChangeInput {
  rawToken: string;
}

/**
 * US-AUT-07 AC-6: Reverts an email change within the 48h window.
 */
export async function revertEmailChange(input: RevertEmailChangeInput): Promise<void> {
  const { rawToken } = input;

  const record = await EmailChangeRepo.findByRawToken(rawToken);
  if (!record) throw new Error('token_not_found');

  EmailChangeToken.validateForRevert(record);

  await withAudit(
    async (tx) => {
      const ok = await EmailChangeRepo.revertById(tx, record.id, record.userId, record.oldEmail, record.createdAt);
      if (!ok) throw new Error('token_already_used');
      return record.userId;
    },
    (userId: string) => ({
      actorUserId: userId,
      category: 'Auth' as const,
      action: 'EMAIL_CHANGE_REVERTED' as const,
      resourceId: userId,
      resourceType: 'User',
    })
  );
}
