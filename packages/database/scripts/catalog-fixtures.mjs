// Synthetic development fixtures. These are not real medicines or clinical data.
export const fixtureSource = 'SYNTHETIC_DEVELOPMENT_FIXTURE';
export const manufacturerId = 'd0000000-0000-4000-8000-000000000001';
export const ingredientId = 'd0000000-0000-4000-8000-000000000002';
/** @type {Array<{id: string, name: string, normalizedName: string, status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED', barcode: string}>} */
export const catalogFixtures = [
  {
    id: 'd0000000-0000-4000-8000-000000000011',
    name: 'DEMO Alpha — not a medicine',
    normalizedName: 'demo alpha — not a medicine',
    status: 'ACTIVE',
    barcode: 'DEMO-000001',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000012',
    name: 'DÉMO Bêta — produit fictif',
    normalizedName: 'démo bêta — produit fictif',
    status: 'ACTIVE',
    barcode: 'DEMO-000002',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000013',
    name: 'دواء تجريبي — ليس دواء حقيقيا',
    normalizedName: 'دواء تجريبي — ليس دواء حقيقيا',
    status: 'ACTIVE',
    barcode: 'DEMO-000003',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000014',
    name: 'DEMO Inactive — not a medicine',
    normalizedName: 'demo inactive — not a medicine',
    status: 'INACTIVE',
    barcode: 'DEMO-000004',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000015',
    name: 'DEMO Archived — not a medicine',
    normalizedName: 'demo archived — not a medicine',
    status: 'ARCHIVED',
    barcode: 'DEMO-000005',
  },
];

/**
 * @typedef {{ $transaction: (callback: (tx: import('../dist/index.js').Prisma.TransactionClient) => Promise<void>) => Promise<void> }} CatalogSeedClient
 */
/** @param {CatalogSeedClient} client */
export async function seedCatalog(client) {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260924, 3)`;
    const manufacturer = await tx.manufacturer.findUnique({
      where: { id: manufacturerId },
    });
    const ingredient = await tx.activeIngredient.findUnique({
      where: { id: ingredientId },
    });
    if (
      (manufacturer &&
        manufacturer.name !== 'DEMO Manufacturer — fictitious') ||
      (ingredient &&
        ingredient.normalizedName !== 'demo ingredient — fictitious')
    ) {
      throw new Error(
        'Fixture identity collision; seed aborted without overwriting records.',
      );
    }
    await tx.manufacturer.upsert({
      where: { id: manufacturerId },
      update: {},
      create: {
        id: manufacturerId,
        name: 'DEMO Manufacturer — fictitious',
        normalizedName: 'demo manufacturer — fictitious',
      },
    });
    await tx.activeIngredient.upsert({
      where: { id: ingredientId },
      update: {},
      create: {
        id: ingredientId,
        name: 'DEMO Ingredient — fictitious',
        normalizedName: 'demo ingredient — fictitious',
        description:
          'Synthetic software test fixture; not a pharmaceutical ingredient.',
      },
    });
    for (const { barcode, ...fixture } of catalogFixtures) {
      const existing = await tx.medicine.findUnique({
        where: { id: fixture.id },
        select: { source: true },
      });
      if (existing && existing.source !== fixtureSource)
        throw new Error('Fixture identity collision; seed aborted.');
      await tx.medicine.upsert({
        where: { id: fixture.id },
        update: {},
        create: {
          ...fixture,
          manufacturerId,
          source: fixtureSource,
          sourceVersion: '1',
          description:
            'Synthetic development fixture. Not a real medicine. Do not use for clinical decisions.',
          ingredients: { create: { ingredientId } },
          barcodes: { create: { barcode, barcodeType: 'OTHER' } },
        },
      });
    }
    await tx.auditLog.create({
      data: {
        action: 'CATALOG_DEVELOPMENT_SEEDED',
        resourceType: 'MEDICINE_CATALOG',
        metadata: { source: fixtureSource, version: '1', result: 'SUCCESS' },
      },
    });
  });
}
