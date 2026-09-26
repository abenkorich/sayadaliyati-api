import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export function createDatabaseClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30000,
      query_timeout: 2000,
    }),
    log: [],
  });
}

export async function isDatabaseReady(client: PrismaClient): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ ready: boolean }>>`
    SELECT (
      to_regclass('public.admin_directory_entries') IS NOT NULL AND
      to_regclass('public.admin_settings') IS NOT NULL AND
      to_regclass('public.admin_transfer_receipts') IS NOT NULL AND
      to_regclass('public.users') IS NOT NULL AND
      to_regclass('public.patient_profiles') IS NOT NULL AND
      to_regclass('public.sessions') IS NOT NULL AND
      to_regclass('public.audit_logs') IS NOT NULL AND
      to_regclass('public.medicines') IS NOT NULL AND
      to_regclass('public.manufacturers') IS NOT NULL AND
      to_regclass('public.active_ingredients') IS NOT NULL AND
      to_regclass('public.medicine_ingredients') IS NOT NULL AND
      to_regclass('public.medicine_barcodes') IS NOT NULL AND
      to_regclass('public.medicine_images') IS NOT NULL AND
      to_regclass('public.medication_inventory') IS NOT NULL AND
      to_regclass('public.prescriptions') IS NOT NULL AND
      to_regclass('public.prescription_medications') IS NOT NULL AND
      to_regclass('public.prescription_extracted_fields') IS NOT NULL AND
      to_regclass('public.prescription_documents') IS NOT NULL AND
      to_regclass('public.notification_preferences') IS NOT NULL AND
      to_regclass('public.treatments') IS NOT NULL AND
      to_regclass('public.treatment_medications') IS NOT NULL AND
      to_regclass('public.medication_schedules') IS NOT NULL AND
      to_regclass('public.medication_occurrences') IS NOT NULL AND
      to_regclass('public.medication_events') IS NOT NULL AND
      to_regclass('public.notifications') IS NOT NULL
    ) AS ready
  `;
  return rows[0]?.ready === true;
}

export { PrismaClient };
export { Prisma } from './generated/client.js';
