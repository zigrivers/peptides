export type VendorStatus = 'ACTIVE' | 'DISABLED';

export const VENDOR_CURRENCIES = ['USDT', 'BTC', 'ETH', 'USD', 'Other'] as const;
export type VendorCurrency = (typeof VENDOR_CURRENCIES)[number];

export interface Vendor {
  id: string;
  userId: string;
  name: string;
  telegramUsername: string;
  messageTemplate: string | null;
  preferredCurrency: string;
  status: VendorStatus;
  createdAt: Date;
}

export interface VendorProduct {
  id: string;
  vendorId: string;
  compoundId: string;
  name: string;
  priceUsd: string;
  inStock: boolean;
}
