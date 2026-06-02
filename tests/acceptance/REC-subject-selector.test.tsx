import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { SubjectSelector } from '@/app/(dashboard)/reconstitution/_components/SubjectSelector';

describe('US-REC: SubjectSelector (caregiver inventory subject switcher)', () => {
  const ACTOR = 'actor-1';

  it('renders nothing when there are no managed users', () => {
    const html = renderToString(
      <SubjectSelector
        actorUserId={ACTOR}
        subjectUserId={ACTOR}
        managedUsers={[]}
      />
    );
    expect(html).toBe('');
  });

  it('renders a subject <select> with the actor (Self) plus each managed user when managed users exist', () => {
    const html = renderToString(
      <SubjectSelector
        actorUserId={ACTOR}
        subjectUserId={ACTOR}
        managedUsers={[
          { id: 'managed-2', name: 'Alice' },
          { id: 'managed-3', name: 'Bob' },
        ]}
      />
    );
    expect(html).toContain('<select');
    expect(html).toContain('Self');
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('value="managed-2"');
    expect(html).toContain('value="managed-3"');
  });

  it('marks the currently-selected subject as the select value', () => {
    const html = renderToString(
      <SubjectSelector
        actorUserId={ACTOR}
        subjectUserId="managed-2"
        managedUsers={[{ id: 'managed-2', name: 'Alice' }]}
      />
    );
    // react-dom/server renders the controlled value via the selected option
    expect(html).toContain('selected');
    expect(html).toContain('Alice');
  });
});
