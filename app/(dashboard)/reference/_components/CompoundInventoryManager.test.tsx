// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import { CompoundInventoryManager } from './CompoundInventoryManager';

// Mock server actions to avoid network call errors during testing
vi.mock('@/app/actions/reconstitution/inventory-actions', () => ({
  addDryVialsAction: vi.fn(),
  addReconstitutedVialAction: vi.fn(),
  reconstituteDryVialAction: vi.fn(),
  deleteVialAction: vi.fn(),
  updateVialRemainingMgAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe('CompoundInventoryManager Client Component', () => {
  const defaultProps = {
    compoundId: 'test-compound-id',
    compoundName: 'BPC-157',
    vials: [],
    fridgeShelfLifeMonths: 6,
    freezerShelfLifeMonths: 24,
    reconstitutedShelfLifeDays: 28,
  };

  const getTodayLocalDateStr = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getOffsetDateStr = (baseDateStr: string, months: number) => {
    const date = new Date(baseDateStr + 'T12:00:00');
    date.setMonth(date.getMonth() + months);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getOffsetDaysStr = (baseDateStr: string, days: number) => {
    const date = new Date(baseDateStr + 'T12:00:00');
    date.setDate(date.getDate() + days);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  it('renders correctly and toggles the add form', () => {
    const { container } = render(<CompoundInventoryManager {...defaultProps} />);
    
    // Add Vials button is visible
    const addBtn = screenBorderBtn(container, 'Add Vials');
    expect(addBtn).toBeTruthy();
    
    // Click to open the form
    fireEvent.click(addBtn!);
    
    // Dry Vials form is active by default
    const quantityInput = container.querySelector('input[type="number"][value="1"]');
    expect(quantityInput).toBeTruthy();
  });

  it('calculates dry vial expiration correctly based on received date and storage method', () => {
    const { container } = render(<CompoundInventoryManager {...defaultProps} />);
    
    const addBtn = screenBorderBtn(container, 'Add Vials');
    fireEvent.click(addBtn!);

    const todayStr = getTodayLocalDateStr();
    
    // In dry vials form, there are two date inputs: Received Date and Expiration Date
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
    
    const expiryInput = dateInputs[1];
    
    // Default is freezer (24 months)
    const expectedFreezerExpiry = getOffsetDateStr(todayStr, 24);
    expect(expiryInput).toBeTruthy();
    expect((expiryInput as HTMLInputElement).value).toBe(expectedFreezerExpiry);

    // Switch storage method to Fridge (6 months)
    const storageSelect = container.querySelector('select');
    expect(storageSelect).toBeTruthy();
    fireEvent.change(storageSelect!, { target: { value: 'fridge' } });

    const expectedFridgeExpiry = getOffsetDateStr(todayStr, 6);
    expect((expiryInput as HTMLInputElement).value).toBe(expectedFridgeExpiry);
  });

  it('calculates reconstituted vial expiration based on reconstitution date and stability shelf life', () => {
    const { container } = render(<CompoundInventoryManager {...defaultProps} />);
    
    const addBtn = screenBorderBtn(container, 'Add Vials');
    fireEvent.click(addBtn!);

    // Switch tab to Reconstituted
    const reconstitutedTab = findButtonByText(container, 'Reconstituted Vial (Liquid)');
    expect(reconstitutedTab).toBeTruthy();
    fireEvent.click(reconstitutedTab!);

    const todayStr = getTodayLocalDateStr();

    // Check expiration date field is auto-populated with reconstitutionDate + 28 days stability
    const expectedExpiry = getOffsetDaysStr(todayStr, 28);
    const expiryInputs = container.querySelectorAll('input[type="date"]');
    // For reconstituted, there are two date inputs: Reconstitution Date and Expiration Date
    expect(expiryInputs.length).toBe(2);
    
    const reconDateInput = expiryInputs[0] as HTMLInputElement;
    const expiryInput = expiryInputs[1] as HTMLInputElement;

    expect(reconDateInput.value).toBe(todayStr);
    expect(expiryInput.value).toBe(expectedExpiry);

    // Change Reconstitution Date to 5 days ago
    const pastDate = getOffsetDaysStr(todayStr, -5);
    fireEvent.change(reconDateInput, { target: { value: pastDate } });

    const expectedNewExpiry = getOffsetDaysStr(pastDate, 28);
    expect(expiryInput.value).toBe(expectedNewExpiry);
  });

  it('auto-calculates expiration when reconstituting an existing dry vial inline', () => {
    const mockVials: SerializedVialData[] = [
      {
        id: 'vial-1',
        compoundId: 'test-compound-id',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        status: 'DRY',
        totalMg: '5.0',
        remainingMg: '5.0',
        bacWaterMl: null,
        expiresAt: '2026-12-31T12:00:00.000Z',
        reconstitutedAt: null,
        daysUntilExpiry: 180,
        badges: [],
      }
    ];

    const { container } = render(
      <CompoundInventoryManager {...defaultProps} vials={mockVials} />
    );

    // Find the Reconstitute button in the dry vial list
    const reconstituteBtn = findButtonByText(container, 'Reconstitute');
    expect(reconstituteBtn).toBeTruthy();
    fireEvent.click(reconstituteBtn!);

    // Reconstitution inputs should now be visible
    const dateInputs = container.querySelectorAll('input[type="date"]');
    // Inline mix form has: Reconstituted On and Expiration Date inputs
    expect(dateInputs.length).toBe(2);

    const reconDateInput = dateInputs[0] as HTMLInputElement;
    const expiryInput = dateInputs[1] as HTMLInputElement;

    const todayStr = getTodayLocalDateStr();
    const expectedExpiry = getOffsetDaysStr(todayStr, 28);

    expect(reconDateInput.value).toBe(todayStr);
    expect(expiryInput.value).toBe(expectedExpiry);

    // Change mix reconstitution date to yesterday
    const yesterday = getOffsetDaysStr(todayStr, -1);
    fireEvent.change(reconDateInput, { target: { value: yesterday } });

    const expectedNewExpiry = getOffsetDaysStr(yesterday, 28);
    expect(expiryInput.value).toBe(expectedNewExpiry);

    // Concentration Display should be 2.50 mg/mL (25.0 mcg/Unit) since totalMg is 5.0 and default BAC Water is 2.0
    const inlineDisplay = container.querySelector('#vial-concentration-display-vial-1');
    expect(inlineDisplay).toBeTruthy();
    expect(inlineDisplay?.textContent).toContain('2.50 mg/mL (25.0 mcg/Unit)');

    // Change BAC Water to 1.0 ml
    const inlineBacInput = container.querySelector('input[placeholder="e.g. 2.0"]');
    expect(inlineBacInput).toBeTruthy();
    fireEvent.change(inlineBacInput!, { target: { value: '1' } });

    // Concentration should update to 5.00 mg/mL (50.0 mcg/Unit)
    expect(inlineDisplay?.textContent).toContain('5.00 mg/mL (50.0 mcg/Unit)');
  });

  it('auto-calculates reconstitution concentration when inputs change in add form', () => {
    const { container } = render(<CompoundInventoryManager {...defaultProps} />);
    
    const addBtn = screenBorderBtn(container, 'Add Vials');
    fireEvent.click(addBtn!);

    // Switch tab to Reconstituted
    const reconstitutedTab = findButtonByText(container, 'Reconstituted Vial (Liquid)');
    fireEvent.click(reconstitutedTab!);

    // Enter Strength: 10 mg
    const strengthInput = container.querySelector('input[placeholder="e.g. 5"]');
    expect(strengthInput).toBeTruthy();
    fireEvent.change(strengthInput!, { target: { value: '10' } });

    // Enter BAC Water: 2.0 ml
    const bacInput = container.querySelector('input[placeholder="e.g. 2.0"]');
    expect(bacInput).toBeTruthy();
    fireEvent.change(bacInput!, { target: { value: '2' } }); // 2.0 ml

    // Concentration Display should be 5.00 mg/mL (50.0 mcg/Unit)
    const display = container.querySelector('#recon-concentration-display');
    expect(display).toBeTruthy();
    expect(display?.textContent).toContain('5.00 mg/mL (50.0 mcg/Unit)');
  });

  // Helper utility functions to locate elements inside testing-library JSDOM environment
  function screenBorderBtn(container: HTMLElement, text: string): HTMLElement | null {
    const buttons = Array.from(container.querySelectorAll('button'));
    return buttons.find(b => b.textContent?.trim().includes(text)) || null;
  }

  function findButtonByText(container: HTMLElement, text: string): HTMLElement | null {
    const buttons = Array.from(container.querySelectorAll('button'));
    return buttons.find(b => b.textContent?.trim() === text) || null;
  }
});
