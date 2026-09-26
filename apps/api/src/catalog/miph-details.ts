import type { Prisma } from '@saydaliyati/database';

function object(value: Prisma.JsonValue | undefined): Prisma.JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}
// Only workbook provenance is exposed, never arbitrary internal metadata.
export function miphDetails(
  source: string | null,
  metadata: Prisma.JsonValue | null,
  checksum: string | null,
) {
  if (source !== 'MIPH') return null;
  const record = object(metadata);
  const raw = object(record?.['raw']);
  if (!raw) return null;
  const formats = object(record?.['rawNumberFormats']);
  const sourceUrl = record?.['sourceUrl'];
  return {
    sourceUrl:
      typeof sourceUrl === 'string' &&
      sourceUrl.startsWith('https://www.miph.gov.dz/')
        ? sourceUrl
        : null,
    sheet: typeof record?.['sheet'] === 'string' ? record['sheet'] : null,
    row: typeof record?.['row'] === 'number' ? record['row'] : null,
    checksum,
    fields: Object.entries(raw).map(([name, value]) => {
      const numberFormat =
        typeof formats?.[name] === 'string' ? formats[name] : null;
      const scalar =
        value == null || typeof value !== 'object'
          ? (value ?? null)
          : JSON.stringify(value);
      // Preserve the original value as well as Excel's explicit percentage unit.
      const displayValue =
        typeof scalar === 'number' &&
        numberFormat &&
        /^0(?:\.0+)?%$/.test(numberFormat)
          ? `${Number((scalar * 100).toPrecision(12))}%`
          : scalar == null || scalar === ''
            ? null
            : String(scalar);
      return { name, value: scalar, numberFormat, displayValue };
    }),
  };
}
