// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { DosingReconstitutionPlanner } from './DosingReconstitutionPlanner';

afterEach(() => {
  cleanup();
});

describe('DosingReconstitutionPlanner Client Component', () => {
  const defaultProps = {
    dosingLow: { amount: '250', unit: 'mcg' },
    dosingTypical: { amount: '500', unit: 'mcg' },
    dosingHigh: { amount: '1000', unit: 'mcg' },
    isFdaApproved: false,
  };

  it('renders correctly with default values (Typical dose selected)', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);
    
    // Default vial is 5 mg
    // Default dilution is 2.0 mL
    // Default typical dose is 500 mcg
    // Draw = 500 / 2500 = 0.2 mL = 20.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText).toBeTruthy();
    expect(unitsText?.textContent?.trim()).toBe('20.0 Units');
  });

  it('re-calculates correctly when Low tier is clicked', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);

    // Click low tier tab by ID
    const lowTab = container.querySelector('#dose-tier-low');
    expect(lowTab).toBeTruthy();
    fireEvent.click(lowTab!);

    // Draw = 250 / 2500 = 0.1 mL = 10.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('10.0 Units');
  });

  it('re-calculates correctly when High tier is clicked', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);

    // Click high tier tab by ID
    const highTab = container.querySelector('#dose-tier-high');
    expect(highTab).toBeTruthy();
    fireEvent.click(highTab!);

    // Draw = 1000 / 2500 = 0.4 mL = 40.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('40.0 Units');
  });

  it('re-calculates concentration and units when BAC Water volume changes', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);

    // Change BAC water to 1.0 mL
    const select = container.querySelector('#bac-water-select');
    expect(select).toBeTruthy();
    fireEvent.change(select!, { target: { value: '1' } });

    // Concentration = 5mg / 1.0mL = 5000 mcg/mL
    // Draw typical = 500 mcg / 5000 mcg/mL = 0.1 mL = 10.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('10.0 Units');
  });

  it('re-calculates concentration and units when Vial Size changes', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);

    // Change Vial size to 10 mg
    const select = container.querySelector('#vial-size-select');
    expect(select).toBeTruthy();
    fireEvent.change(select!, { target: { value: '10' } });

    // Concentration = 10mg / 2.0mL = 5000 mcg/mL
    // Draw typical = 500 mcg / 5000 mcg/mL = 0.1 mL = 10.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('10.0 Units');
  });

  it('displays overflow warning when calculated units exceed syringe capacity', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);

    // Select syringe size 30 Units (0.3 mL)
    const syringeSelect = container.querySelector('#syringe-size-select');
    expect(syringeSelect).toBeTruthy();
    fireEvent.change(syringeSelect!, { target: { value: '30' } });

    // Click high tier tab (needs 40 Units)
    const highTab = container.querySelector('#dose-tier-high');
    expect(highTab).toBeTruthy();
    fireEvent.click(highTab!);

    // Should display warning alert
    const warning = container.querySelector('#syringe-overflow-warning');
    expect(warning).toBeTruthy();
    expect(warning?.textContent).toContain('exceeds your 30 Unit syringe limit');
  });

  it('supports custom vial size inputs', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);

    // Open custom option
    const select = container.querySelector('#vial-size-select');
    expect(select).toBeTruthy();
    fireEvent.change(select!, { target: { value: 'custom' } });

    // Find and fill custom input
    const customInput = container.querySelector('#custom-vial-input');
    expect(customInput).toBeTruthy();
    fireEvent.change(customInput!, { target: { value: '4' } }); // 4mg vial

    // Concentration = 4mg / 2.0mL = 2.0 mg/mL = 2000 mcg/mL
    // Draw typical = 500 mcg / 2000 mcg/mL = 0.25 mL = 25.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('25.0 Units');
  });

  it('supports custom BAC water inputs', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);

    // Open custom option
    const select = container.querySelector('#bac-water-select');
    expect(select).toBeTruthy();
    fireEvent.change(select!, { target: { value: 'custom' } });

    // Find and fill custom input
    const customInput = container.querySelector('#custom-bac-input');
    expect(customInput).toBeTruthy();
    fireEvent.change(customInput!, { target: { value: '1.5' } }); // 1.5mL

    // Concentration = 5mg / 1.5mL = 3333.33 mcg/mL
    // Draw typical = 500 mcg / 3333.33 mcg/mL = 0.15 mL = 15.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('15.0 Units');
  });

  it('uses U-40 conversion when initialSyringeStandard is "U40" (default 5mg/2mL/500mcg => 8.0 Units)', () => {
    const { container } = render(
      <DosingReconstitutionPlanner {...defaultProps} initialSyringeStandard="U40" />
    );
    // 5mg / 2.0mL = 2500 mcg/mL; 500mcg => 0.2 mL; U-40 (0.025 mL/unit): 0.2 / 0.025 = 8.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('8.0 Units');
  });

  it('matches the standalone calculator for 20mg/2mL/500mcg on a U-40 syringe (2.0 Units)', () => {
    const { container } = render(
      <DosingReconstitutionPlanner {...defaultProps} initialSyringeStandard="U40" />
    );
    fireEvent.change(container.querySelector('#vial-size-select')!, { target: { value: 'custom' } });
    fireEvent.change(container.querySelector('#custom-vial-input')!, { target: { value: '20' } });
    // 20mg / 2.0mL = 10000 mcg/mL; 500mcg => 0.05 mL; U-40: 0.05 / 0.025 = 2.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('2.0 Units');
  });

  it('shows 5.0 Units for 20mg/2mL/500mcg on a U-100 syringe (default standard)', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);
    fireEvent.change(container.querySelector('#vial-size-select')!, { target: { value: 'custom' } });
    fireEvent.change(container.querySelector('#custom-vial-input')!, { target: { value: '20' } });
    // U-100 (0.01 mL/unit): 0.05 / 0.01 = 5.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('5.0 Units');
  });

  it('toggling the syringe standard selector to U-40 re-computes units', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);
    // default U-100: 0.2 mL => 20.0 Units
    expect(container.querySelector('#draw-units-text')?.textContent?.trim()).toBe('20.0 Units');

    fireEvent.change(container.querySelector('#syringe-standard-select')!, { target: { value: 'U40' } });
    // U-40: 0.2 mL => 8.0 Units
    expect(container.querySelector('#draw-units-text')?.textContent?.trim()).toBe('8.0 Units');
  });

  it('renders the FDA Approved badge if isFdaApproved is true', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} isFdaApproved={true} />);
    const badge = container.querySelector('#fda-badge');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain('FDA Approved');
  });

  it('hides the FDA Approved badge if isFdaApproved is false', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} isFdaApproved={false} />);
    const badge = container.querySelector('#fda-badge');
    expect(badge).toBeNull();
  });

  it('displays warning alert and defaults output to 0.0 when custom inputs are zero or negative', () => {
    const { container } = render(<DosingReconstitutionPlanner {...defaultProps} />);

    // Open custom option
    const select = container.querySelector('#vial-size-select');
    expect(select).toBeTruthy();
    fireEvent.change(select!, { target: { value: 'custom' } });

    // Fill custom input with 0
    const customInput = container.querySelector('#custom-vial-input');
    expect(customInput).toBeTruthy();
    fireEvent.change(customInput!, { target: { value: '0' } });

    // Should display invalid parameters warning
    const warning = container.querySelector('#invalid-inputs-warning');
    expect(warning).toBeTruthy();
    expect(warning?.textContent).toContain('Invalid Reconstitution Parameters');

    // Units text should fallback to 0.0 Units
    const unitsText = container.querySelector('#draw-units-text');
    expect(unitsText?.textContent?.trim()).toBe('0.0 Units');
  });
});
