import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DOCUMENT_STORAGE_ENDPOINT: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === '/'
        );
      })
      .optional(),
    DOCUMENT_STORAGE_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
      .optional(),
    DOCUMENT_STORAGE_REGION: z.string().min(1).default('us-east-1'),
    DOCUMENT_STORAGE_ACCESS_KEY: z.string().min(1).optional(),
    DOCUMENT_STORAGE_SECRET_KEY: z.string().min(16).optional(),
    AUTH_SECRET: z.string().regex(/^[0-9a-f]{64}$/),
    REDIS_URL: z
      .string()
      .url()
      .refine((value) =>
        ['redis:', 'rediss:'].includes(new URL(value).protocol),
      ),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ['postgres:', 'postgresql:'].includes(url.protocol) &&
          url.pathname.length > 1
        );
      }),
  })
  .superRefine((value, ctx) => {
    const keys = [
      'DOCUMENT_STORAGE_ENDPOINT',
      'DOCUMENT_STORAGE_BUCKET',
      'DOCUMENT_STORAGE_ACCESS_KEY',
      'DOCUMENT_STORAGE_SECRET_KEY',
    ] as const;
    if (keys.some((key) => value[key] !== undefined)) {
      for (const key of keys)
        if (!value[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'Required' });
      if (
        value.NODE_ENV === 'production' &&
        !value.DOCUMENT_STORAGE_ENDPOINT?.startsWith('https://')
      )
        ctx.addIssue({
          code: 'custom',
          path: ['DOCUMENT_STORAGE_ENDPOINT'],
          message: 'HTTPS required',
        });
    }
  });

export type ApiConfig = z.infer<typeof environmentSchema>;
export const API_CONFIG = Symbol('API_CONFIG');

export function readConfig(environment: NodeJS.ProcessEnv): ApiConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    // Never expose the supplied values or Zod's detailed input errors.
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
