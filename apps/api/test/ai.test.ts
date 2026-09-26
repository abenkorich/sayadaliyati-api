import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiSettingsSchema, aiQuerySchema } from '../src/admin/ai.schemas.js';
import {
  estimateCost,
  verifyOpenAI,
  type Usage,
} from '../src/admin/ai.service.js';
import { extractWithOpenAI } from '../src/prescriptions/scan-provider.js';
const rates = { inputRate: 2, cachedInputRate: 0.5, outputRate: 8 };
test('AI costs respect cached input and unknown usage or rates', () => {
  const usage = {
    inputTokens: 1000000,
    cachedInputTokens: 200000,
    outputTokens: 100000,
  };
  assert.equal(Number(estimateCost(usage, rates)), 2.5);
  assert.equal(
    Number(estimateCost(usage, { ...rates, cachedInputRate: null })),
    2.8,
  );
  assert.equal(estimateCost(undefined, rates), null);
  assert.equal(estimateCost(usage, { ...rates, outputRate: null }), null);
  assert.equal(
    Number(
      estimateCost(usage, { inputRate: 0, cachedInputRate: 0, outputRate: 0 }),
    ),
    0,
  );
});
test('AI settings reject secrets, unsafe models and invalid budgets', () => {
  const input = {
    enabled: true,
    model: 'test-model',
    ...rates,
    monthlyBudget: 20,
  };
  assert.ok(aiSettingsSchema.safeParse(input).success);
  for (const value of [
    { ...input, apiKey: 'secret' },
    { ...input, model: '../../foo' },
    { ...input, monthlyBudget: -1 },
    { ...input, inputRate: Infinity },
    { ...input, cachedInputRate: 3 },
  ])
    assert.equal(aiSettingsSchema.safeParse(value).success, false);
  assert.equal(aiQuerySchema.safeParse({ days: '3650' }).success, false);
  assert.equal(aiQuerySchema.safeParse({ page: -1 }).success, false);
});
test('verification is bounded, does not generate, and sanitizes provider failures', async () => {
  for (const [code, status] of [
    [200, 'ACCESSIBLE'],
    [401, 'INVALID_CREDENTIALS'],
    [403, 'ACCESS_DENIED'],
    [404, 'MODEL_UNAVAILABLE'],
    [429, 'RATE_LIMITED'],
    [500, 'PROVIDER_UNAVAILABLE'],
  ] as const) {
    assert.equal(
      await verifyOpenAI('private', 'test:model', async (url, init) => {
        assert.equal(url, 'https://api.openai.com/v1/models/test%3Amodel');
        assert.equal(init?.body, undefined);
        assert.equal(init?.redirect, 'error');
        assert.ok(init?.signal);
        return new Response('secret diagnostic', { status: code });
      }),
      status,
    );
  }
  assert.equal(
    await verifyOpenAI('private', 'test', async () => {
      throw Error('secret');
    }),
    'CONNECTION_FAILED',
  );
});
test('scan metering captures only valid tokens including refused and incomplete responses', async () => {
  for (const status of ['completed', 'incomplete']) {
    const meter: { usage?: Usage; httpStatus?: number } = {};
    await assert.rejects(
      extractWithOpenAI(
        'private',
        'test',
        Buffer.from('crop'),
        async () =>
          new Response(
            JSON.stringify({
              status,
              usage: {
                input_tokens: 100,
                output_tokens: 40,
                input_tokens_details: { cached_tokens: 20 },
              },
              output: [
                {
                  type: 'message',
                  content: [{ type: 'refusal', text: 'private-health-text' }],
                },
              ],
            }),
          ),
        false,
        meter,
      ),
      { code: 'PRESCRIPTION_SCAN_FAILED' },
    );
    assert.deepEqual(meter, {
      httpStatus: 200,
      usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 40 },
    });
    assert.ok(!JSON.stringify(meter).includes('private'));
  }
  const meter: { usage?: Usage; httpStatus?: number } = {};
  await assert.rejects(
    extractWithOpenAI(
      'private',
      'test',
      Buffer.from('crop'),
      async () =>
        new Response(
          JSON.stringify({ usage: { input_tokens: 10, output_tokens: -1 } }),
        ),
      false,
      meter,
    ),
  );
  assert.equal(meter.usage, undefined);
});
