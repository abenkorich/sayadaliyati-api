import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  prescriptionCreateSchema,
  prescriptionMedicationSchema,
  prescriptionReviewSchema,
} from '@saydaliyati/validation';
const medicineId = 'e0000000-0000-4000-8000-000000000001';
test('manual prescription values remain unknown unless supplied and quantity cannot be zero', () => {
  const result = prescriptionMedicationSchema.parse({ medicineId });
  assert.equal(result.quantity, null);
  assert.equal(result.dosage, null);
  assert.equal(result.scheduledTimes, null);
  for (const quantity of [0, -1, 0.0001, '1'])
    assert.equal(
      prescriptionMedicationSchema.safeParse({ medicineId, quantity }).success,
      false,
    );
  assert.equal(
    prescriptionMedicationSchema.safeParse({
      extractedName: 'Unresolved synthetic label',
      quantity: null,
    }).success,
    true,
  );
  assert.equal(
    prescriptionMedicationSchema.safeParse({ quantity: 1 }).success,
    false,
  );
});
test('manual drafts reject invented provenance, unverified doctors, confirmation and invalid regimen fields', () => {
  for (const input of [
    { doctorId: medicineId },
    { source: 'SCANNED' },
    { status: 'CONFIRMED' },
    { patientId: medicineId },
    { prescriptionDate: '2026-09-24', validUntil: '2026-09-23' },
  ]) {
    assert.equal(
      prescriptionCreateSchema.safeParse({
        medications: [{ medicineId }],
        ...input,
      }).success,
      false,
    );
  }
  for (const input of [
    { dosage: 0 },
    { dosage: 0.00001 },
    { confidence: 1 },
    { confirmed: true },
    { startDate: '2026-10-02', endDate: '2026-10-01' },
    { scheduledTimes: ['25:00'] },
    { scheduledTimes: ['08:00', '08:00'] },
  ]) {
    assert.equal(
      prescriptionMedicationSchema.safeParse({ medicineId, ...input }).success,
      false,
    );
  }
});
test('field review rejects duplicate IDs, actor metadata, empty edits and premature prescription confirmation', () => {
  const review = { fieldId: medicineId, value: null, confirmed: false };
  for (const input of [
    {},
    { fieldReviews: [] },
    { fieldReviews: [review, review] },
    { status: 'CONFIRMED' },
    { fieldReviews: [{ ...review, source: 'AI' }] },
    { fieldReviews: [{ ...review, confirmedBy: medicineId }] },
    { status: 'ARCHIVED', fieldReviews: [review] },
  ])
    assert.equal(prescriptionReviewSchema.safeParse(input).success, false);
  assert.equal(
    prescriptionReviewSchema.safeParse({ fieldReviews: [review] }).success,
    true,
  );
});
