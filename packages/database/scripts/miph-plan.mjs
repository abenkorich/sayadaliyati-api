/**
 * @typedef {Record<string, string | null | undefined>} Medicine
 * @typedef {{sheet: string, row: number, regulatoryStatus: string, candidate: Medicine, issues: string[]}} StagedRecord
 * @param {{records: StagedRecord[]}} stage
 * @param {Medicine[]} existing
 */
export function planImport(stage, existing) {
  /** @type {Map<string | null | undefined, Medicine[]>} */
  const byRegistration = new Map();
  for (const medicine of existing) {
    const key = medicine.registrationNumber
      ?.normalize('NFC')
      .trim()
      .replace(/\s+/gu, ' ');
    const group = byRegistration.get(key) ?? [];
    group.push(medicine);
    byRegistration.set(key, group);
  }
  const counts = { new: 0, updated: 0, unchanged: 0, review: 0 };
  const changes = stage.records.map((record) => {
    const issues = [...record.issues];
    const matches =
      byRegistration.get(record.candidate.registrationNumber) ?? [];
    if (matches.length > 1) issues.push('multiple_database_matches');
    if (matches.some((match) => match.source !== 'MIPH'))
      issues.push('other_source_match');
    const match = matches.length === 1 ? matches[0] : null;
    const changedFields = match
      ? Object.keys(record.candidate).filter(
          (key) => (match[key] ?? null) !== record.candidate[key],
        )
      : [];
    // Matching a registration alone cannot authorize replacing a different product identity.
    if (
      match &&
      ['name', 'genericName', 'strength', 'dosageForm', 'packageSize'].some(
        (key) => (match[key] ?? null) !== record.candidate[key],
      )
    )
      issues.push('identity_change_requires_review');
    const action = issues.length
      ? 'review'
      : !match
        ? 'new'
        : changedFields.length
          ? 'updated'
          : 'unchanged';
    counts[action]++;
    return {
      sheet: record.sheet,
      row: record.row,
      registrationNumber: record.candidate.registrationNumber,
      name: record.candidate.name,
      regulatoryStatus: record.regulatoryStatus,
      medicineId: match?.id ?? null,
      action,
      changedFields,
      issues,
    };
  });
  const seen = new Set(
    stage.records.map((r) => r.candidate.registrationNumber),
  );
  const missingFromSource = existing
    .filter((m) => m.source === 'MIPH' && !seen.has(m.registrationNumber))
    .map((m) => ({
      medicineId: m.id,
      registrationNumber: m.registrationNumber,
      action: 'review',
    }));
  return { counts, changes, missingFromSource };
}
