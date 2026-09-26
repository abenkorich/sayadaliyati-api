import type { Usage } from '../admin/ai.service.js';
import { z } from 'zod';
import { ApiError } from '../auth/errors.js';
import {
  scanInstructions,
  scanResultSchema,
  boxResultSchema,
  boxInstructions,
} from './scan-schema.js';
const outputSchema = z.toJSONSchema(scanResultSchema);
export async function extractWithOpenAI(
  key: string,
  model: string,
  image: Buffer,
  transport: typeof fetch = fetch,
  box = false,
  telemetry?: { usage?: Usage; httpStatus?: number },
) {
  try {
    const response = await transport('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 6000,
        instructions: box ? boxInstructions : scanInstructions,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Transcribe only the explicitly visible medicines from this patient-reviewed crop.',
              },
              {
                type: 'input_image',
                image_url: `data:image/jpeg;base64,${image.toString('base64')}`,
                detail: 'high',
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'prescription_preview',
            strict: true,
            schema: box ? z.toJSONSchema(boxResultSchema) : outputSchema,
          },
        },
      }),
    });
    if (telemetry) telemetry.httpStatus = response.status;
    if (!response.ok || !response.body) throw new Error('Provider unavailable');
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 256000) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(next.value);
    }
    const envelope: unknown = JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    );
    const meter = z
      .object({
        usage: z.object({
          input_tokens: z.number().int().min(0).max(2147483647),
          output_tokens: z.number().int().min(0).max(2147483647),
          input_tokens_details: z
            .object({ cached_tokens: z.number().int().min(0).max(2147483647) })
            .optional(),
        }),
      })
      .safeParse(envelope);
    if (telemetry && meter.success) {
      const u = meter.data.usage;
      if ((u.input_tokens_details?.cached_tokens ?? 0) <= u.input_tokens)
        telemetry.usage = {
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
        };
    }
    const parsed = z
      .object({
        status: z.literal('completed'),
        output: z.array(
          z.object({
            type: z.string(),
            content: z
              .array(
                z.object({ type: z.string(), text: z.string().optional() }),
              )
              .optional(),
          }),
        ),
      })
      .parse(envelope);
    const content = parsed.output
      .filter((x) => x.type === 'message')
      .flatMap((x) => x.content ?? []);
    if (content.some((x) => x.type === 'refusal')) throw new Error('Refused');
    const text = content
      .filter((x) => x.type === 'output_text')
      .map((x) => x.text ?? '')
      .join('');
    if (!box) return scanResultSchema.parse(JSON.parse(text));
    const result = boxResultSchema.parse(JSON.parse(text));
    return {
      prescriptionDate: null,
      validUntil: null,
      medications: result.extractedName
        ? [
            {
              extractedName: result.extractedName,
              strength: result.strength,
              dosage: null,
              dosageUnit: null,
              frequency: null,
              frequencyUnit: null,
              duration: null,
              durationUnit: null,
              quantity: null,
              instructions: null,
              scheduledTimes: null,
              startDate: null,
              endDate: null,
            },
          ]
        : [],
      warnings: result.warnings,
      packageInfo: {
        quantity: result.quantity,
        unit: result.unit,
        expiryDate: result.expiryDate,
      },
    };
  } catch {
    throw new ApiError('PRESCRIPTION_SCAN_FAILED');
  }
}
