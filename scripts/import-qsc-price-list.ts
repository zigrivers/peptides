/**
 * One-off import of the QSC vendor price list into a user's account.
 *
 * Idempotent: upserts the QSC vendor (by userId + telegramUsername) and replaces
 * its VendorProduct rows wholesale on each run. Scoped to the target user's vendor
 * only — never touches other vendors/products.
 *
 * Usage:
 *   IMPORT_USER_EMAIL=zigrivers@gmail.com pnpm tsx scripts/import-qsc-price-list.ts
 *
 * Prices are the listed pack prices (USD); the pack size (e.g. "10 vials") is recorded
 * in the product name, and vialSizeMg is the per-vial milligram strength (null when the
 * strength is expressed in IU, e.g. HGH).
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const VENDOR_NAME = 'QSC';
const VENDOR_TELEGRAM = 'tracyfromqsc'; // QSC's Telegram contact (stored without the leading @)
const VENDOR_CURRENCY = 'USD';

// Each row: catalog compound name (must match CatalogItem.name exactly),
// a human label for the dose, the per-vial mg strength (null for IU products),
// the pack quantity (vials), and the listed USD price for that pack.
type Row = { compound: string; dose: string; mg: number | null; pack: number; price: string };

const ROWS: Row[] = [
  { compound: 'Adipotide', dose: '2mg', mg: 2, pack: 10, price: '70.00' },
  { compound: 'Adipotide', dose: '5mg', mg: 5, pack: 10, price: '140.00' },
  { compound: 'AOD-9604', dose: '2mg', mg: 2, pack: 10, price: '50.00' },
  { compound: 'AOD-9604', dose: '10mg', mg: 10, pack: 10, price: '180.00' },
  { compound: 'ARA-290', dose: '10mg', mg: 10, pack: 10, price: '100.00' },
  { compound: 'BPC-157', dose: '20mg', mg: 20, pack: 10, price: '115.00' },
  { compound: 'BPC-157 / TB-500', dose: '10mg', mg: 10, pack: 10, price: '150.00' },
  { compound: 'BPC-157 / TB-500', dose: '20mg', mg: 20, pack: 10, price: '200.00' },
  { compound: 'CJC-1295 No DAC / Ipamorelin', dose: '10mg', mg: 10, pack: 10, price: '120.00' },
  { compound: 'CJC-1295 No DAC', dose: '10mg', mg: 10, pack: 10, price: '135.00' },
  { compound: 'DSIP', dose: '2mg', mg: 2, pack: 10, price: '40.00' },
  { compound: 'DSIP', dose: '15mg', mg: 15, pack: 10, price: '100.00' },
  { compound: 'Epitalon', dose: '10mg', mg: 10, pack: 10, price: '60.00' },
  { compound: 'FOXO4-DRI', dose: '5mg', mg: 5, pack: 10, price: '185.00' },
  { compound: 'GHK-Cu', dose: '100mg', mg: 100, pack: 10, price: '80.00' },
  { compound: 'GHRP-2', dose: '10mg', mg: 10, pack: 10, price: '50.00' },
  { compound: 'GHRP-6', dose: '10mg', mg: 10, pack: 10, price: '50.00' },
  { compound: 'GLOW70', dose: '70mg', mg: 70, pack: 10, price: '200.00' },
  { compound: 'Hexarelin', dose: '5mg', mg: 5, pack: 10, price: '95.00' },
  { compound: 'HGH', dose: '6IU', mg: null, pack: 50, price: '250.00' },
  { compound: 'IGF-1 LR3', dose: '1mg', mg: 1, pack: 10, price: '200.00' },
  { compound: 'Ipamorelin', dose: '5mg', mg: 5, pack: 10, price: '50.00' },
  { compound: 'Ipamorelin', dose: '10mg', mg: 10, pack: 10, price: '80.00' },
  { compound: 'KPV', dose: '10mg', mg: 10, pack: 10, price: '70.00' },
  { compound: 'KPV', dose: '30mg', mg: 30, pack: 10, price: '200.00' },
  { compound: 'LL-37', dose: '5mg', mg: 5, pack: 10, price: '100.00' },
  { compound: 'Melanotan-1', dose: '10mg', mg: 10, pack: 10, price: '80.00' },
  { compound: 'MOTS-c', dose: '10mg', mg: 10, pack: 10, price: '80.00' },
  { compound: 'MOTS-c', dose: '40mg', mg: 40, pack: 10, price: '250.00' },
  { compound: 'NA-Semax-Amidate', dose: '30mg', mg: 30, pack: 10, price: '120.00' },
  { compound: 'NA-Selank-Amidate', dose: '30mg', mg: 30, pack: 10, price: '120.00' },
  { compound: 'NAD+', dose: '1000mg', mg: 1000, pack: 10, price: '220.00' },
  { compound: 'Oxytocin', dose: '10mg', mg: 10, pack: 10, price: '80.00' },
  { compound: 'PE-22-28', dose: '10mg', mg: 10, pack: 10, price: '70.00' },
  { compound: 'Retatrutide', dose: '10mg', mg: 10, pack: 10, price: '120.00' },
  { compound: 'Retatrutide', dose: '30mg', mg: 30, pack: 10, price: '250.00' },
  { compound: 'Retatrutide', dose: '50mg', mg: 50, pack: 10, price: '300.00' },
  { compound: 'Selank', dose: '10mg', mg: 10, pack: 10, price: '70.00' },
  { compound: 'Selank', dose: '30mg', mg: 30, pack: 10, price: '120.00' },
  { compound: 'Semaglutide', dose: '10mg', mg: 10, pack: 10, price: '70.00' },
  { compound: 'Semaglutide', dose: '20mg', mg: 20, pack: 10, price: '100.00' },
  { compound: 'Semax', dose: '5mg', mg: 5, pack: 10, price: '50.00' },
  { compound: 'Semax', dose: '30mg', mg: 30, pack: 10, price: '120.00' },
  { compound: 'Sermorelin', dose: '2mg', mg: 2, pack: 10, price: '50.00' },
  { compound: 'Sermorelin', dose: '10mg', mg: 10, pack: 10, price: '110.00' },
  { compound: 'SS-31', dose: '10mg', mg: 10, pack: 10, price: '100.00' },
  { compound: 'TB-500', dose: '5mg', mg: 5, pack: 10, price: '70.00' },
  { compound: 'TB-500', dose: '10mg', mg: 10, pack: 10, price: '135.00' },
  { compound: 'TB-500 Fragment (889 Da)', dose: '8mg', mg: 8, pack: 10, price: '120.00' },
  { compound: 'Tesamorelin', dose: '5mg', mg: 5, pack: 10, price: '110.00' },
  { compound: 'Tesamorelin', dose: '10mg', mg: 10, pack: 10, price: '200.00' },
  { compound: 'Tirzepatide', dose: '5mg', mg: 5, pack: 20, price: '100.00' },
  { compound: 'Tirzepatide', dose: '10mg', mg: 10, pack: 20, price: '140.00' },
  { compound: 'Tirzepatide', dose: '30mg', mg: 30, pack: 10, price: '120.00' },
  { compound: 'Tirzepatide', dose: '60mg', mg: 60, pack: 10, price: '200.00' },
  { compound: 'Thymalin', dose: '10mg', mg: 10, pack: 10, price: '80.00' },
  { compound: 'Thymosin Alpha-1', dose: '5mg', mg: 5, pack: 10, price: '80.00' },
];

async function main() {
  const email = process.env.IMPORT_USER_EMAIL;
  if (!email) throw new Error('Set IMPORT_USER_EMAIL to the owning user email.');

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No user found for email ${email}`);

  // Resolve catalog compound ids by exact name.
  const names = Array.from(new Set(ROWS.map((r) => r.compound)));
  const catalog = await prisma.catalogItem.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
  const idByName = new Map(catalog.map((c) => [c.name, c.id]));
  const missing = names.filter((n) => !idByName.has(n));
  if (missing.length) throw new Error(`Catalog is missing these compounds: ${missing.join(', ')}`);

  // Upsert the QSC vendor for this user (unique on userId + telegramUsername).
  const existing = await prisma.vendor.findFirst({
    where: { userId: user.id, telegramUsername: VENDOR_TELEGRAM },
    select: { id: true },
  });
  const vendor = existing
    ? await prisma.vendor.update({
        where: { id: existing.id },
        data: { name: VENDOR_NAME, preferredCurrency: VENDOR_CURRENCY, status: 'ACTIVE' },
      })
    : await prisma.vendor.create({
        data: {
          userId: user.id,
          name: VENDOR_NAME,
          telegramUsername: VENDOR_TELEGRAM,
          preferredCurrency: VENDOR_CURRENCY,
          status: 'ACTIVE',
        },
      });

  // Replace this vendor's products wholesale (idempotent re-run).
  await prisma.vendorProduct.deleteMany({ where: { vendorId: vendor.id } });

  const data: Prisma.VendorProductCreateManyInput[] = ROWS.map((r) => ({
    vendorId: vendor.id,
    compoundId: idByName.get(r.compound)!,
    name: `${r.compound} ${r.dose} (${r.pack} vials)`,
    priceUsd: new Prisma.Decimal(r.price),
    inStock: true,
    form: 'LYOPHILIZED_POWDER',
    vialSizeMg: r.mg === null ? null : new Prisma.Decimal(r.mg),
  }));
  const created = await prisma.vendorProduct.createMany({ data });

  console.log(`QSC vendor ${vendor.id} for ${email}: imported ${created.count} products across ${names.length} compounds.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
