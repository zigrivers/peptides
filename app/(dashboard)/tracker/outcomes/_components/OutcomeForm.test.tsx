// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutcomeForm } from './OutcomeForm';

describe('OutcomeForm', () => {
  it('renders overall and per-protocol rating buttons as touch-sized controls', () => {
    render(
      <OutcomeForm
        action={vi.fn()}
        scheduledDateISO="2026-06-10"
        suggestedTags={[]}
        activeProtocols={[{ id: 'protocol-1', name: 'BPC-157' }]}
        existingOutcome={null}
      />
    );

    const ratingButtons = screen.getAllByRole('button', { name: /^[1-5]$/ });

    expect(ratingButtons.length).toBeGreaterThanOrEqual(10);
    for (const button of ratingButtons) {
      expect(button.className).toContain('min-h-10');
      expect(button.className).toContain('min-w-10');
    }
  });
});
