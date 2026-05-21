export type VendorStatus = 'ACTIVE' | 'DISABLED';

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
