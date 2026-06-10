// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDraftOrderAction, getVendorProductsAction } from '@/app/actions/ordering/order';
import { OrderBuilderContainer } from './OrderBuilderContainer';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/app/actions/ordering/order', () => ({
  createDraftOrderAction: vi.fn(),
  getVendorProductsAction: vi.fn(),
}));

const vendor = {
  id: 'vendor-1',
  name: 'Peptide Depot',
  preferredCurrency: 'USD',
  telegramUsername: 'peptidedepot_bot',
};

const compound = {
  id: 'compound-bpc',
  name: 'BPC-157',
};

const suggestion = {
  compoundId: compound.id,
  compoundName: compound.name,
  formCategory: 'Injectable' as const,
  dailyRateMg: '0.3',
  totalRemainingMg: '1.200',
  daysUntilDepletion: 4,
  isDefaultConcentration: false,
};

const product = {
  id: 'product-bpc-5',
  vendorId: vendor.id,
  compoundId: compound.id,
  name: 'BPC-157 5mg vial',
  priceUsd: '35.00',
  inStock: true,
  form: 'LYOPHILIZED_POWDER',
  vialSizeMg: '5',
};

beforeEach(() => {
  vi.mocked(createDraftOrderAction).mockResolvedValue({ ok: true, orderId: 'order-1' });
  vi.mocked(getVendorProductsAction).mockResolvedValue({ ok: true, products: [product] });
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('OrderBuilderContainer', () => {
  it('marks a replenishment suggestion as added once it is already in the draft', async () => {
    render(
      <OrderBuilderContainer
        vendors={[vendor]}
        suggestions={[suggestion]}
        compounds={[compound]}
      />
    );

    fireEvent.change(screen.getByLabelText(/select vendor/i), { target: { value: vendor.id } });

    const addSuggestion = await screen.findByRole('button', { name: /add suggestion/i });
    fireEvent.click(addSuggestion);

    await waitFor(() => {
      expect((screen.getByRole('button', { name: /added to draft/i }) as HTMLButtonElement).disabled).toBe(true);
    });

    expect(screen.queryByRole('button', { name: /add suggestion/i })).toBeNull();
    expect(screen.getByText(/BPC-157 \(Lyophilized\)/i)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });
});
