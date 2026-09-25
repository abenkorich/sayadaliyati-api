import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
  'dist',
  'build',
  'coverage',
  '.expo',
]);

/** @param {string} directory @returns {string[]} */
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excluded.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return entry.isFile() ? [relative(root, path).split(sep).join('/')] : [];
  });
}

/** @param {string} path */
function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

/** @param {unknown} value */
function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--write')) {
  throw new Error('Usage: node scripts/spec-metadata.mjs [--write]');
}

const files = filesIn(root);
const documentation = files.filter((path) => path.endsWith('.md')).sort();
const manifest = {
  ...JSON.parse(read('PACKAGE-MANIFEST.json')),
  documentation,
};
const expectedManifest = json(manifest);
const paths = [
  ...new Set([
    ...documentation,
    ...files.filter((path) => path.startsWith('design-assets/')),
    'PACKAGE-MANIFEST.json',
  ]),
].sort();
const checksums = Object.fromEntries(
  paths.map((path) => [
    path,
    createHash('sha256')
      .update(
        path === 'PACKAGE-MANIFEST.json'
          ? expectedManifest
          : readFileSync(join(root, path)),
      )
      .digest('hex'),
  ]),
);
const expectedChecksums = json(checksums);

if (args[0] === '--write') {
  writeFileSync(join(root, 'PACKAGE-MANIFEST.json'), expectedManifest);
  writeFileSync(join(root, 'CHECKSUMS-SHA256.json'), expectedChecksums);
  console.log(
    `Updated specification metadata: ${documentation.length} documents, ${paths.length} checksums.`,
  );
} else {
  const errors = [];
  if (read('PACKAGE-MANIFEST.json') !== expectedManifest)
    errors.push('PACKAGE-MANIFEST.json inventory is stale.');
  if (read('CHECKSUMS-SHA256.json') !== expectedChecksums)
    errors.push('CHECKSUMS-SHA256.json coverage or hashes are stale.');
  for (const path of documentation) {
    for (const match of read(path).matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1];
      if (!link || /^(?:[a-z]+:|#)/i.test(link)) continue;
      const target = link.split('#')[0];
      if (!target) continue;
      const resolved = relative(root, join(root, dirname(path), target))
        .split(sep)
        .join('/');
      if (!files.includes(resolved))
        errors.push(`${path}: missing local link ${link}`);
    }
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(
      'Review changed documents, then run pnpm metadata:update for intentional changes.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Specification metadata verified: ${documentation.length} documents, ${paths.length} checksums; local file links resolve.`,
    );
  }
}
