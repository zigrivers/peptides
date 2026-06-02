// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { SyringePreferencesForm } from './SyringePreferencesForm';
import { saveSyringePreferencesAction } from '@/app/actions/reconstitution/save-syringe-preferences';

vi.mock('@/app/actions/reconstitution/save-syringe-preferences', () => ({
  saveSyringePreferencesAction: vi.fn(),
}));

const mockedSave = vi.mocked(saveSyringePreferencesAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SyringePreferencesForm', () => {
  it('renders with the initial values selected', () => {
    render(<SyringePreferencesForm initialSyringeStandard="U40" initialSyringeSize="0.5" />);

    const typeSelect = screen.getByLabelText('Syringe type') as HTMLSelectElement;
    const sizeSelect = screen.getByLabelText('Syringe capacity') as HTMLSelectElement;

    expect(typeSelect.value).toBe('U40');
    expect(sizeSelect.value).toBe('0.5');
  });

  it('calls saveSyringePreferencesAction with the selected values on Save', async () => {
    mockedSave.mockResolvedValue({ ok: true });
    render(<SyringePreferencesForm initialSyringeStandard="U100" initialSyringeSize="1.0" />);

    fireEvent.change(screen.getByLabelText('Syringe type'), { target: { value: 'U40' } });
    fireEvent.change(screen.getByLabelText('Syringe capacity'), { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledWith('U40', '0.3');
    });
  });

  it('shows a success message when the action succeeds', async () => {
    mockedSave.mockResolvedValue({ ok: true });
    render(<SyringePreferencesForm initialSyringeStandard="U100" initialSyringeSize="1.0" />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Syringe preferences saved.')).toBeTruthy();
  });

  it('shows an error message when the action fails', async () => {
    mockedSave.mockResolvedValue({ ok: false, error: 'system_error' });
    render(<SyringePreferencesForm initialSyringeStandard="U100" initialSyringeSize="1.0" />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Could not save syringe preferences. Please try again.')
    ).toBeTruthy();
  });
});
