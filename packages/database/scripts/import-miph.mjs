import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { planImport } from './miph-plan.mjs';
import { assertImportTarget, importDatabase } from './miph-database.mjs';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    version: { type: 'string' },
    'source-url': { type: 'string' },
    out: { type: 'string' },
    offline: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    'confirm-target': { type: 'string' },
    rollback: { type: 'boolean', default: false },
  },
});
if (!values.file || !values.version || !values['source-url'] || !values.out) {
  throw new Error(
    'Required: --file <xlsx> --version <version> --source-url <url> --out <new-directory> [--offline]',
  );
}
const source = resolve(values.file);
if ((values.offline && values.apply) || (values.rollback && !values.apply))
  throw new Error('--offline cannot apply; --rollback requires --apply.');
const original = await readFile(source);
const stage = JSON.parse(
  execFileSync(
    process.env['MIPH_PYTHON'] ?? 'python3',
    [
      fileURLToPath(new URL('./extract-miph.py', import.meta.url)),
      source,
      '--version',
      values.version,
      '--source-url',
      values['source-url'],
    ],
    { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
  ),
);
if (stage.sha256 !== createHash('sha256').update(original).digest('hex')) {
  throw new Error(
    'Source changed during extraction; retry with an immutable copy.',
  );
}
// Preserve the input before any database writes. An existing directory is an error.
const output = resolve(values.out);
await mkdir(output, { recursive: false });
await writeFile(join(output, 'source.xlsx'), original, { flag: 'wx' });
await writeFile(
  join(output, 'staging.json'),
  JSON.stringify(stage, null, 2) + '\n',
  { flag: 'wx' },
);
let result = { ...planImport(stage, []), importId: null, rolledBack: false };
if (!values.offline) {
  const connectionString =
    process.env[values.apply ? 'MIGRATION_DATABASE_URL' : 'DATABASE_URL'];
  if (!connectionString)
    throw new Error(
      'DATABASE_URL required for comparison; MIGRATION_DATABASE_URL required for apply.',
    );
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  try {
    if (values.apply) assertImportTarget(connectionString, values['confirm-target']);
    await client.connect();
    result = await importDatabase(client, stage, {
      apply: values.apply,
      rollback: values.rollback,
    });
  } finally {
    await client.end();
  }
}
const report = {
  mode: values.rollback
    ? 'rollback-test'
    : values.apply
      ? 'applied'
      : 'dry-run',
  databaseCompared: !values.offline,
  offlineNote: values.offline
    ? 'New means candidate only; database was not compared.'
    : null,
  sourceVersion: stage.sourceVersion,
  sha256: stage.sha256,
  sheetCounts: stage.sheetCounts,
  ...result,
};
await writeFile(
  join(output, 'report.json'),
  JSON.stringify(report, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(
  JSON.stringify(
    {
      mode: report.mode,
      databaseCompared: report.databaseCompared,
      sheetCounts: report.sheetCounts,
      counts: report.counts,
      missingFromSource: report.missingFromSource.length,
      output,
    },
    null,
    2,
  ),
);
