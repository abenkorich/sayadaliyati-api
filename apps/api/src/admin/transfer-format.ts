import { z } from 'zod';
import {
  directorySchema,
  medicineSchema,
  settingsSchema,
} from './admin.schemas.js';
export const datasetSchema = z.enum([
  'users',
  'medicines',
  'doctors',
  'pharmacies',
  'hospitals',
  'settings',
]);
export type Dataset = z.infer<typeof datasetSchema>;
export const formatSchema = z.enum(['json', 'csv']);
export type Format = z.infer<typeof formatSchema>;
export type TransferRow = Record<string, string | null>;
export type Issue = { row: number; field: string; message: string };
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_IMPORT_ROWS = 500;
export const transferInputSchema = z
  .object({
    format: formatSchema,
    content: z.string().max(MAX_FILE_BYTES),
    token: z.string().max(2000).optional(),
  })
  .strict();
export const exportQuerySchema = z
  .object({
    format: formatSchema,
    q: z.string().trim().max(100).default(''),
    template: z.enum(['true', 'false']).default('false'),
  })
  .strict();
export const columns: Record<Dataset, readonly string[]> = {
  users: ['id', 'email', 'phone', 'role', 'status', 'createdAt', 'lastLoginAt'],
  medicines: [
    'id',
    'name',
    'genericName',
    'strength',
    'dosageForm',
    'status',
    'source',
  ],
  doctors: [
    'id',
    'name',
    'specialty',
    'licenseNumber',
    'address',
    'city',
    'phone',
    'email',
    'status',
  ],
  pharmacies: [
    'id',
    'name',
    'specialty',
    'licenseNumber',
    'address',
    'city',
    'phone',
    'email',
    'status',
  ],
  hospitals: [
    'id',
    'name',
    'specialty',
    'licenseNumber',
    'address',
    'city',
    'phone',
    'email',
    'status',
  ],
  settings: ['organizationName', 'supportEmail', 'defaultLanguage', 'timezone'],
};
const id = z.string().uuid().optional();
const schemas = {
  users: z
    .object({
      id: z.string().uuid(),
      status: z.enum([
        'ACTIVE',
        'SUSPENDED',
        'DISABLED',
        'PENDING_VERIFICATION',
      ]),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      role: z.enum(['PATIENT', 'DOCTOR', 'PHARMACY', 'ADMIN']).optional(),
      createdAt: z.string().optional(),
      lastLoginAt: z.string().nullable().optional(),
    })
    .strict(),
  medicines: medicineSchema
    .extend({ id, source: z.string().trim().min(1).max(150).nullable() })
    .refine((row) => !!row.id || !!row.source, {
      path: ['source'],
      message: 'A source is required for a new medicine.',
    }),
  doctors: directorySchema.extend({ id }),
  pharmacies: directorySchema.extend({ id }),
  hospitals: directorySchema.extend({ id }),
  settings: settingsSchema,
};
// RFC 4180-style records: quoted commas, CRLF and multiline fields; reject malformed quotes.
export function parseCsv(content: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const text = content.replace(/^\uFEFF/, '');
  const pushField = () => {
    row.push(field);
    field = '';
    closed = false;
  };
  const pushRow = () => {
    pushField();
    records.push(row);
    row = [];
    if (records.length > MAX_IMPORT_ROWS + 1)
      throw new Error(`Use at most ${MAX_IMPORT_ROWS} rows per import.`);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (c === '"') {
      if (field || closed) throw new Error('Unexpected quote in CSV.');
      quoted = true;
    } else if (c === ',') pushField();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else {
      if (closed) throw new Error('Unexpected text after a quoted CSV field.');
      field += c;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length || closed) pushRow();
  return records;
}
const dangerous = /^(?:\s*[=+\-@]|[\t\r\n'])/u;
function cell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (dangerous.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function serialize(
  dataset: Dataset,
  format: Format,
  rows: TransferRow[],
): string {
  return format === 'json'
    ? JSON.stringify(rows, null, 2) + '\n'
    : '\uFEFF' +
        [
          columns[dataset].map(cell).join(','),
          ...rows.map((row) =>
            columns[dataset].map((key) => cell(row[key])).join(','),
          ),
        ].join('\r\n') +
        '\r\n';
}
export function parseTransfer(
  dataset: Dataset,
  format: Format,
  content: string,
): { rows: TransferRow[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const rows: TransferRow[] = [];
  const fail = (message: string) => ({
    rows: [],
    issues: [{ row: 0, field: 'file', message }],
  });
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES)
    return fail('File exceeds 512 KiB.');
  let input: unknown;
  try {
    if (format === 'json') input = JSON.parse(content.replace(/^\uFEFF/, ''));
    else {
      const [headers, ...records] = parseCsv(content);
      if (!headers?.length || new Set(headers).size !== headers.length)
        return fail('CSV headers must be present and unique.');
      if (headers.some((header) => !columns[dataset].includes(header)))
        return fail(
          'CSV contains an unknown column. Download a template for this dataset.',
        );
      input = records.map((record, index) => {
        if (record.length !== headers.length) {
          issues.push({
            row: index + 1,
            field: 'file',
            message: 'CSV column count does not match the header.',
          });
          return {};
        }
        return Object.fromEntries(
          headers.map((header, i) => {
            let value = record[i]!;
            // Reverse only the escape applied by our exporter, including literal apostrophes.
            if (value.startsWith("'") && dangerous.test(value.slice(1)))
              value = value.slice(1);
            return [
              header,
              value === ''
                ? header === 'id' ||
                  (dataset === 'users' && header !== 'status')
                  ? undefined
                  : null
                : value,
            ];
          }),
        );
      });
    }
  } catch (error) {
    return fail(
      format === 'json'
        ? 'Invalid JSON. Use an array of records.'
        : error instanceof Error
          ? error.message
          : 'Invalid CSV.',
    );
  }
  if (!Array.isArray(input) || !input.length)
    return fail(
      'Provide a non-empty array of records or a CSV with data rows.',
    );
  if (input.length > MAX_IMPORT_ROWS)
    return fail(`Use at most ${MAX_IMPORT_ROWS} rows per import.`);
  if (dataset === 'settings' && input.length !== 1)
    return fail('Settings requires exactly one record.');
  const seen = new Set<string>();
  input.forEach((value, index) => {
    const parsed = schemas[dataset].safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 5))
        issues.push({
          row: index + 1,
          field: issue.path.join('.') || 'record',
          message: issue.message,
        });
      return;
    }
    const data = parsed.data as TransferRow;
    if (data.id) {
      if (seen.has(data.id))
        issues.push({
          row: index + 1,
          field: 'id',
          message: 'Duplicate ID in this file.',
        });
      seen.add(data.id);
    }
    rows.push(data);
  });
  return { rows, issues: issues.slice(0, 100) };
}
