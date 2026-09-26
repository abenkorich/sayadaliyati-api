import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@saydaliyati/database';
import { z } from 'zod';
import { DatabaseService } from '../database.service.js';

export const directoryKind = z.enum(['hospitals', 'pharmacies', 'doctors']);
export const directoryQuery = z
  .object({
    countryId: z.string().uuid().optional(),
    wilayaId: z.string().uuid().optional(),
    communeId: z.string().uuid().optional(),
    q: z.string().trim().max(100).default(''),
    city: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const directorySelect = {
  country: {
    select: { nameEnglish: true, nameFrench: true, nameArabic: true },
  },
  wilaya: { select: { nameEnglish: true, nameFrench: true, nameArabic: true } },
  commune: {
    select: { nameEnglish: true, nameFrench: true, nameArabic: true },
  },
  id: true,
  kind: true,
  name: true,
  specialty: true,
  address: true,
  city: true,
  phone: true,
  email: true,
} as const;
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');
@Injectable()
export class DirectoryService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async list(
    kind: z.infer<typeof directoryKind>,
    query: z.infer<typeof directoryQuery>,
  ) {
    const { q, city, page, limit } = query;
    const where: Prisma.AdminDirectoryEntryWhereInput = {
      kind,
      status: 'ACTIVE',
      ...(query.countryId ? { countryId: query.countryId } : {}),
      ...(query.wilayaId ? { wilayaId: query.wilayaId } : {}),
      ...(query.communeId ? { communeId: query.communeId } : {}),
      ...(city
        ? { city: { contains: literal(city), mode: 'insensitive' as const } }
        : {}),
      ...(q
        ? {
            OR: ['name', 'specialty', 'address', 'city'].map((field) => ({
              [field]: { contains: literal(q), mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [data, total] = await this.db.client.$transaction([
      this.db.client.adminDirectoryEntry.findMany({
        where,
        select: directorySelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.client.adminDirectoryEntry.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
