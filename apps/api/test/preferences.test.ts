import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notificationPreferencesPatchSchema } from '@saydaliyati/validation';
test('preference patches require strict booleans and an explicit allowlisted change', () => {
  for (const input of [
    {},
    { doseReminders: 'false' },
    { systemNotifications: 0 },
    { expiryReminders: null },
    { userId: 'owner' },
    { configured: true },
    { createdAt: '2026-09-25' },
    { expiryLeadDays: -1 },
    { expiryLeadDays: 1.5 },
    { expiryLeadDays: '3' },
    { expiryLeadDays: 2147483648 },
  ])
    assert.equal(
      notificationPreferencesPatchSchema.safeParse(input).success,
      false,
    );
  for (const input of [
    { doseReminders: false },
    { expiryLeadDays: null },
    { expiryLeadDays: 0 },
    { expiryLeadDays: 2147483647 },
  ])
    assert.equal(
      notificationPreferencesPatchSchema.safeParse(input).success,
      true,
    );
});
