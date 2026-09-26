import { z } from 'zod';
import { parseCsv } from '../admin/transfer-format.js';
export const geoKind = z.enum(['countries', 'wilayas', 'communes']);
export const geoQuery = z
  .object({ parentId: z.string().uuid().optional() })
  .strict();
export const geoRecord = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[A-Za-z0-9-]+$/),
    parentId: z.string().uuid().nullable().default(null),
    nameEnglish: z.string().trim().min(1).max(150),
    nameFrench: z.string().trim().max(150).nullable().default(null),
    nameArabic: z.string().trim().max(150).nullable().default(null),
    zone: z.string().trim().max(32).nullable().default(null),
    isDeliverable: z.boolean().nullable().default(null),
  })
  .strict();
export const geoImport = z
  .object({
    content: z
      .string()
      .min(1)
      .max(2 * 1024 * 1024),
    countryId: z.string().uuid().optional(),
  })
  .strict();
export function readGeoCsv(kind: z.infer<typeof geoKind>, content: string) {
  if (Buffer.byteLength(content) > 2 * 1024 * 1024)
    throw new Error('CSV must be at most 2 MB.');
  const [header, ...rows] = parseCsv(content, 5000);
  if (!header || !rows.length)
    throw new Error('Include a header and at least one data row.');
  const aliases: Record<string, string> = {
    'country code': 'code',
    wilayaid: kind === 'communes' ? 'wilayaCode' : 'code',
    communeid: 'code',
    'english name': 'nameEnglish',
    'name english': 'nameEnglish',
    name: 'nameEnglish',
    'french name': 'nameFrench',
    'name french': 'nameFrench',
    'arabic name': 'nameArabic',
    'name arabic': 'nameArabic',
    zone: 'zone',
    isdeliverable: 'isDeliverable',
    'wilayaname english': 'ignoreEN',
    'wilayaname french': 'ignoreFR',
    'wilayaname arabic': 'ignoreAR',
  };
  const keys = header.map((h) => aliases[h.trim().toLowerCase()]);
  if (
    keys.some((k) => !k) ||
    new Set(keys).size !== keys.length ||
    !keys.includes('code') ||
    !keys.includes('nameEnglish') ||
    (kind === 'communes' && !keys.includes('wilayaCode'))
  )
    throw new Error(
      'Use the CSV template headers. Required: code, English name, and wilayaId for communes.',
    );
  const seen = new Set<string>();
  return rows.map((values, index) => {
    if (values.length !== keys.length)
      throw new Error(
        `Row ${index + 2}: column count does not match the header.`,
      );
    const row = Object.fromEntries(
      keys.map((key, i) => [key!, values[i]!.trim()]),
    );
    const code = kind === 'countries' ? row.code!.toUpperCase() : row.code!;
    const unique = `${row.wilayaCode ?? ''}:${code}`;
    if (seen.has(unique)) throw new Error(`Row ${index + 2}: duplicate code.`);
    seen.add(unique);
    if (
      row.isDeliverable &&
      !['true', 'false'].includes(row.isDeliverable.toLowerCase())
    )
      throw new Error(`Row ${index + 2}: isDeliverable must be true or false.`);
    const parsed = geoRecord.safeParse({
      code,
      nameEnglish: row.nameEnglish,
      nameFrench: row.nameFrench || null,
      nameArabic: row.nameArabic || null,
      zone: row.zone || null,
      isDeliverable: row.isDeliverable
        ? row.isDeliverable.toLowerCase() === 'true'
        : null,
    });
    if (!parsed.success || (kind === 'countries' && !/^[A-Z]{2}$/.test(code)))
      throw new Error(`Row ${index + 2}: invalid code or name.`);
    return { ...parsed.data, wilayaCode: row.wilayaCode, row: index + 2 };
  });
}
