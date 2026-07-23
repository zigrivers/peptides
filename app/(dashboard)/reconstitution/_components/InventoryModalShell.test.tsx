// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InventoryModalShell } from './InventoryModalShell';

afterEach(() => cleanup());

function OpenShellWithCounter() {
  const [count, setCount] = useState(0);
  return (
    <InventoryModalShell>
      <div role="dialog" aria-label="Test dialog">
        <p data-testid="counter-value">{count}</p>
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          bump
        </button>
      </div>
    </InventoryModalShell>
  );
}

describe('InventoryModalShell', () => {
  it('renders a single portal shell with a non-filter, non-animated scrim', async () => {
    render(
      <InventoryModalShell>
        <div role="dialog" aria-label="Fixture dialog">
          content
        </div>
      </InventoryModalShell>
    );

    expect(await screen.findByRole('dialog', { name: /fixture dialog/i })).toBeTruthy();

    const shells = document.querySelectorAll('[data-inventory-modal-shell]');
    const scrims = document.querySelectorAll('[data-inventory-modal-scrim]');
    expect(shells).toHaveLength(1);
    expect(scrims).toHaveLength(1);

    const scrim = scrims[0] as HTMLElement;
    expect(scrim.className).toContain('bg-background/80');
    expect(scrim.className).not.toMatch(/backdrop-blur/);
    expect(scrim.className).not.toMatch(/animate-fade-in/);
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the same scrim DOM node across routine re-renders while open', async () => {
    render(<OpenShellWithCounter />);

    expect(await screen.findByRole('dialog', { name: /test dialog/i })).toBeTruthy();
    const scrimBefore = document.querySelector('[data-inventory-modal-scrim]');
    expect(scrimBefore).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /bump/i }));
    fireEvent.click(screen.getByRole('button', { name: /bump/i }));

    expect(screen.getByTestId('counter-value').textContent).toBe('2');
    const scrimAfter = document.querySelector('[data-inventory-modal-scrim]');
    expect(scrimAfter).toBe(scrimBefore);
    expect(scrimAfter!.className).not.toMatch(/backdrop-blur|animate-fade-in/);
    expect(document.querySelectorAll('[data-inventory-modal-shell]')).toHaveLength(1);
  });
});
