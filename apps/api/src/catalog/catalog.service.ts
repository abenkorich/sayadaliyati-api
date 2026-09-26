import { Inject, Injectable } from '@nestjs/common';
import type { MedicineQuery } from '@saydaliyati/validation';
import { ApiError } from '../auth/errors.js';
import { miphDetails } from './miph-details.js';
import { CatalogRepository } from './catalog.repository.js';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CatalogRepository) private readonly repository: CatalogRepository,
  ) {}
  search(query: MedicineQuery) {
    return this.repository.search(query);
  }
  async filters() {
    return { data: await this.repository.filters(), meta: {} };
  }
  async categories() {
    return { data: await this.repository.categories(), meta: {} };
  }
  async detail(id: string) {
    return this.envelope(await this.repository.byId(id));
  }
  async barcode(barcode: string) {
    return this.envelope(await this.repository.byBarcode(barcode));
  }
  private envelope(row: Awaited<ReturnType<CatalogRepository['byId']>>) {
    if (!row) throw new ApiError('RESOURCE_NOT_FOUND');
    const { sourceMetadata, sourceChecksum, ...medicine } = row;
    return {
      data: {
        ...medicine,
        miph: miphDetails(row.source, sourceMetadata, sourceChecksum),
        ingredients: row.ingredients.map(({ ingredient, amount, unit }) => ({
          ...ingredient,
          amount: amount?.toString() ?? null,
          unit,
        })),
      },
      meta: {},
    };
  }
}
