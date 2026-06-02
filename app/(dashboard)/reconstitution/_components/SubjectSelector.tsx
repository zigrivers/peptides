'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';

export interface SubjectOption {
  id: string;
  name: string | null;
}

interface Props {
  actorUserId: string;
  subjectUserId: string;
  managedUsers: SubjectOption[];
}

/**
 * Caregiver subject switcher for the reconstitution/inventory page.
 *
 * Only rendered when the actor actually manages someone (managedUsers non-empty); for a
 * lone user there is nothing to switch between, so we render nothing. Changing the selection
 * navigates to `?subject=<id>` — the server page re-resolves + re-authorizes the subject
 * (resolveSubjectUserId) so the URL alone can never leak another user's inventory.
 */
export function SubjectSelector({ actorUserId, subjectUserId, managedUsers }: Props) {
  const router = useRouter();

  if (managedUsers.length === 0) return null;

  const handleChange = (nextSubjectId: string) => {
    if (nextSubjectId === actorUserId) {
      router.push('/reconstitution');
    } else {
      router.push(`/reconstitution?subject=${encodeURIComponent(nextSubjectId)}`);
    }
  };

  return (
    <div className="flex items-center justify-center">
      <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-semibold">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Viewing inventory for</span>
        <select
          aria-label="Select whose inventory to view"
          value={subjectUserId}
          onChange={(e) => handleChange(e.target.value)}
          className="rounded-md border border-border bg-background text-foreground text-sm font-semibold focus:border-primary focus:ring-primary py-1 px-2"
        >
          <option value={actorUserId}>Me (Self)</option>
          {managedUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.id}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
