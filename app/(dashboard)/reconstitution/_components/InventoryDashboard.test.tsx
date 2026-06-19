// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { InventoryDashboard } from './InventoryDashboard';

describe('InventoryDashboard', () => {
  it('keeps the header actions focused on inventory tasks', () => {
    const { getByRole, queryByRole } = render(
      <InventoryDashboard
        coldDryVials={[]}
        coldActiveVials={[]}
        roomTempDryVials={[]}
        roomTempActiveVials={[]}
        onAddDry={vi.fn()}
        onAddActive={vi.fn()}
      />
    );

    expect(getByRole('button', { name: /add dry vials/i })).toBeTruthy();
    expect(getByRole('button', { name: /add ready vial/i })).toBeTruthy();
    expect(queryByRole('button', { name: /sound effects/i })).toBeNull();
  });
});
