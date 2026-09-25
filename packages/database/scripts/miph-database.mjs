import { planImport } from './miph-plan.mjs';

/**
 * @param {string} connection
 * @param {string | undefined} target
 */
export function assertImportTarget(connection, target) {
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('PostgreSQL connection required.');
  if (target !== undefined) {
    const actual = `${url.hostname}:${url.port || '5432'}${url.pathname}`;
    if (target !== actual) throw new Error('Import target does not match the configured connection.');
    return;
  }
  assertLocalImport(connection);
}

/** @param {string} connection */
export function assertLocalImport(connection) {
  const url = new URL(connection);
  if (
    process.env['NODE_ENV'] === 'production' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !['/saydaliyati', '/saydaliyati_test'].includes(url.pathname)
  ) {
    throw new Error(
      'Apply is restricted to local Saydaliyati development/test databases.',
    );
  }
}

/**
 * @typedef {import('./miph-plan.mjs').StagedRecord & {raw: Record<string, unknown>, rawNumberFormats?: Record<string, string>}} SourceRecord
 * @typedef {{sourceVersion: string, sourceUrl: string, sha256: string, records: SourceRecord[]}} Stage
 * @param {import('pg').Client} client
 * @param {Stage} stage
 * @param {{apply?: boolean, rollback?: boolean}} options
 */
export async function importDatabase(client, stage, options = {}) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(stage.sourceVersion) ||
    new Date(stage.sourceVersion).toISOString().slice(0, 10) !==
      stage.sourceVersion
  ) {
    throw new Error('Source version must be a valid ISO date (YYYY-MM-DD).');
  }
  await client.query(
    options.apply ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  try {
    if (options.apply) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('miph_import'))",
      );
      await client.query('LOCK TABLE medicines IN SHARE ROW EXCLUSIVE MODE');
      const newer = await client.query(
        "SELECT 1 FROM medicine_imports WHERE source = 'MIPH' AND source_version > $1 LIMIT 1",
        [stage.sourceVersion],
      );
      if (newer.rowCount)
        throw new Error(
          'Refusing to apply a release older than the last imported release.',
        );
    }
    const existing =
      await client.query(`SELECT id, name, normalized_name AS "normalizedName",
      brand_name AS "brandName", generic_name AS "genericName", strength,
      dosage_form AS "dosageForm", package_size AS "packageSize",
      registration_number AS "registrationNumber", status, country, source,
      source_version AS "sourceVersion", regulatory_status AS "regulatoryStatus",
      registration_holder AS "registrationHolder", holder_country AS "holderCountry",
      source_checksum AS "sourceChecksum" FROM medicines`);
    const report = planImport(stage, existing.rows);
    let importId = null;
    if (options.apply) {
      const selected = stage.records.flatMap((record, index) => {
        const change = report.changes[index];
        if (!change || !['new', 'updated'].includes(change.action)) return [];
        return [
          {
            ...record.candidate,
            sourceMetadata: {
              sourceUrl: stage.sourceUrl,
              sheet: record.sheet,
              row: record.row,
              raw: record.raw,
              rawNumberFormats: record.rawNumberFormats,
            },
          },
        ];
      });
      // One batch statement plus the import snapshot and audit event commit atomically.
      await client.query(
        `INSERT INTO medicines (
        name, normalized_name, brand_name, generic_name, strength, dosage_form,
        package_size, registration_number, status, country, source, source_version,
        regulatory_status, registration_holder, holder_country, source_checksum,
        source_metadata, source_updated_at)
        SELECT r->>'name', r->>'normalizedName', r->>'brandName', r->>'genericName',
          r->>'strength', r->>'dosageForm', r->>'packageSize', r->>'registrationNumber',
          (r->>'status')::medicine_status, r->>'country', r->>'source', r->>'sourceVersion',
          r->>'regulatoryStatus', r->>'registrationHolder', r->>'holderCountry',
          r->>'sourceChecksum', r->'sourceMetadata', now()
        FROM jsonb_array_elements($1::jsonb) r
        ON CONFLICT (registration_number) WHERE source = 'MIPH' DO UPDATE SET
          name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name,
          brand_name = EXCLUDED.brand_name, generic_name = EXCLUDED.generic_name,
          strength = EXCLUDED.strength, dosage_form = EXCLUDED.dosage_form,
          package_size = EXCLUDED.package_size, country = EXCLUDED.country,
          status = EXCLUDED.status, source_version = EXCLUDED.source_version,
          regulatory_status = EXCLUDED.regulatory_status,
          registration_holder = EXCLUDED.registration_holder,
          holder_country = EXCLUDED.holder_country,
          source_checksum = EXCLUDED.source_checksum,
          source_metadata = EXCLUDED.source_metadata,
          source_updated_at = now(), updated_at = now()`,
        [JSON.stringify(selected)],
      );
      const result = await client.query(
        `INSERT INTO medicine_imports
        (source, source_version, checksum, source_url, snapshot, report)
        VALUES ('MIPH', $1, $2, $3, $4::jsonb, $5::jsonb) RETURNING id`,
        [
          stage.sourceVersion,
          stage.sha256,
          stage.sourceUrl,
          JSON.stringify(stage),
          JSON.stringify(report),
        ],
      );
      importId = result.rows[0].id;
      await client.query(
        `INSERT INTO audit_logs (action, resource_type, resource_id, metadata)
        VALUES ('medicine_catalog.miph_import', 'medicine_import', $1, $2::jsonb)`,
        [
          importId,
          JSON.stringify({ checksum: stage.sha256, counts: report.counts }),
        ],
      );
    }
    await client.query(options.rollback ? 'ROLLBACK' : 'COMMIT');
    return {
      ...report,
      importId: options.rollback ? null : importId,
      rolledBack: !!options.rollback,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
