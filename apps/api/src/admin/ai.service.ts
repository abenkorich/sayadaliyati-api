import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@saydaliyati/database';
import { API_CONFIG, type ApiConfig } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
import { requireAdmin } from './admin.service.js';
import type { AiSettingsInput, AiQuery } from './ai.schemas.js';
export type Usage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};
export function estimateCost(
  usage: Usage | undefined,
  rates: Pick<AiSettingsInput, 'inputRate' | 'cachedInputRate' | 'outputRate'>,
) {
  if (!usage || rates.inputRate === null || rates.outputRate === null)
    return null;
  return new Prisma.Decimal(usage.inputTokens - usage.cachedInputTokens)
    .mul(rates.inputRate)
    .add(
      new Prisma.Decimal(usage.cachedInputTokens).mul(
        rates.cachedInputRate ?? rates.inputRate,
      ),
    )
    .add(new Prisma.Decimal(usage.outputTokens).mul(rates.outputRate))
    .div(1000000)
    .toDecimalPlaces(8);
}
export async function verifyOpenAI(
  key: string,
  model: string,
  transport: typeof fetch = fetch,
) {
  try {
    const response = await transport(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      },
    );
    await response.body?.cancel();
    if (response.ok) return 'ACCESSIBLE';
    if (response.status === 401) return 'INVALID_CREDENTIALS';
    if (response.status === 403) return 'ACCESS_DENIED';
    if (response.status === 404) return 'MODEL_UNAVAILABLE';
    if (response.status === 429) return 'RATE_LIMITED';
    return 'PROVIDER_UNAVAILABLE';
  } catch {
    return 'CONNECTION_FAILED';
  }
}
@Injectable()
export class AiService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RateLimitService) private readonly rate: RateLimitService,
  ) {}
  async configuration() {
    const saved = await this.db.client.aiSettings.findUnique({
      where: { id: 'platform' },
    });
    const model = saved?.model ?? this.config.PRESCRIPTION_SCAN_MODEL ?? null;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([this.config.OPENAI_API_KEY ?? '', model]))
      .digest('hex');
    return {
      enabled: saved?.enabled ?? true,
      model: saved?.model ?? null,
      effectiveModel: model,
      keyConfigured: !!this.config.OPENAI_API_KEY,
      inputRate: saved?.inputRate ?? null,
      cachedInputRate: saved?.cachedInputRate ?? null,
      outputRate: saved?.outputRate ?? null,
      monthlyBudget: saved?.monthlyBudget ?? null,
      verification:
        saved?.checkFingerprint === fingerprint
          ? {
              status: saved.checkStatus ?? 'NOT_CHECKED',
              checkedAt: saved.checkedAt,
            }
          : { status: 'NOT_CHECKED', checkedAt: null },
    };
  }
  private async write<T>(
    actor: AuthContext,
    action: string,
    requestId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    requireAdmin(actor);
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizeOwnerMutation(tx, actor);
      const user = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { role: true },
      });
      if (user?.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
      const result = await operation(tx);
      await tx.auditLog.createMany({
        data: [
          {
            actorId: actor.userId,
            action,
            resourceType: 'AI_SETTINGS',
            resourceId: '00000000-0000-0000-0000-000000000000',
            requestId,
          },
        ],
      });
      return result;
    });
  }
  async settings(actor: AuthContext) {
    requireAdmin(actor);
    return { data: await this.configuration(), meta: {} };
  }
  async save(actor: AuthContext, value: AiSettingsInput, requestId: string) {
    await this.write(actor, 'AI_SETTINGS_UPDATED', requestId, (tx) =>
      tx.aiSettings.upsert({
        where: { id: 'platform' },
        create: { id: 'platform', ...value },
        update: value,
      }),
    );
    return this.settings(actor);
  }
  async verify(actor: AuthContext, requestId: string) {
    requireAdmin(actor);
    await this.rate.check('admin-ai-verify', actor.userId, 3, 60000);
    const config = await this.configuration();
    const status =
      !config.keyConfigured || !config.effectiveModel
        ? 'NOT_CONFIGURED'
        : await verifyOpenAI(
            this.config.OPENAI_API_KEY!,
            config.effectiveModel,
          );
    const checkedAt = new Date();
    const checkFingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          this.config.OPENAI_API_KEY ?? '',
          config.effectiveModel,
        ]),
      )
      .digest('hex');
    const values = { checkedAt, checkStatus: status, checkFingerprint };
    await this.write(actor, 'AI_CONNECTION_VERIFIED', requestId, (tx) =>
      tx.aiSettings.upsert({
        where: { id: 'platform' },
        create: { id: 'platform', ...values },
        update: values,
      }),
    );
    return this.settings(actor);
  }
  async dashboard(actor: AuthContext, query: AiQuery) {
    requireAdmin(actor);
    const now = new Date(),
      since = new Date(now.getTime() - Number(query.days) * 86400000);
    const where: Prisma.AiRequestWhereInput = {
      createdAt: { gte: since, lte: now },
      ...(query.feature ? { feature: query.feature } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [config, result] = await Promise.all([
      this.configuration(),
      this.db.client.$transaction(
        async (tx) => {
          const [
            totals,
            statuses,
            history,
            month,
            features,
            daily,
            unknown,
            unknownMonth,
          ] = await Promise.all([
            tx.aiRequest.aggregate({
              where,
              _count: { _all: true, inputTokens: true, estimatedCostUsd: true },
              _sum: {
                inputTokens: true,
                cachedInputTokens: true,
                outputTokens: true,
                estimatedCostUsd: true,
              },
              _avg: { durationMs: true },
            }),
            tx.aiRequest.groupBy({
              by: ['status'],
              where,
              _count: { _all: true },
            }),
            tx.aiRequest.findMany({
              where,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 25,
              skip: (query.page - 1) * 25,
            }),
            tx.aiRequest.aggregate({
              where: { createdAt: { gte: monthStart, lte: now } },
              _sum: { estimatedCostUsd: true },
              _count: { _all: true },
            }),
            tx.aiRequest.groupBy({
              by: ['feature'],
              where,
              _count: { _all: true },
              _sum: {
                inputTokens: true,
                outputTokens: true,
                estimatedCostUsd: true,
              },
            }),
            tx.$queryRaw<
              Array<{
                date: string;
                requests: number;
                tokens: bigint;
                cost: Prisma.Decimal | null;
              }>
            >(
              Prisma.sql`SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS date, count(*)::int AS requests, coalesce(sum(coalesce(input_tokens,0)+coalesce(output_tokens,0)),0)::bigint AS tokens, sum(estimated_cost_usd) AS cost FROM ai_requests WHERE created_at >= ${since} AND created_at <= ${now} ${query.feature ? Prisma.sql`AND feature = ${query.feature}` : Prisma.empty} ${query.status ? Prisma.sql`AND status = ${query.status}` : Prisma.empty} GROUP BY 1 ORDER BY 1`,
            ),
            tx.aiRequest.count({ where: { ...where, estimatedCostUsd: null } }),
            tx.aiRequest.count({
              where: {
                createdAt: { gte: monthStart, lte: now },
                estimatedCostUsd: null,
              },
            }),
          ]);
          return {
            totals,
            statuses,
            history,
            month,
            features,
            daily,
            unknown,
            unknownMonth,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      ),
    ]);
    const {
      totals,
      statuses,
      history,
      month,
      features,
      daily,
      unknown,
      unknownMonth,
    } = result;
    const spend = Number(month._sum.estimatedCostUsd ?? 0);
    return {
      data: {
        period: {
          since: since.toISOString(),
          until: now.toISOString(),
          days: Number(query.days),
        },
        stats: {
          requests: totals._count._all,
          successful:
            statuses.find((x) => x.status === 'SUCCEEDED')?._count._all ?? 0,
          failed: statuses.find((x) => x.status === 'FAILED')?._count._all ?? 0,
          pending:
            statuses.find((x) => x.status === 'STARTED')?._count._all ?? 0,
          inputTokens: totals._sum.inputTokens ?? 0,
          cachedInputTokens: totals._sum.cachedInputTokens ?? 0,
          outputTokens: totals._sum.outputTokens ?? 0,
          averageDurationMs: totals._avg.durationMs,
          estimatedCostUsd:
            totals._sum.estimatedCostUsd === null
              ? null
              : Number(totals._sum.estimatedCostUsd),
          unknownCostRequests: unknown,
          unknownUsageRequests: totals._count._all - totals._count.inputTokens,
        },
        credits: {
          currency: 'USD',
          month: monthStart.toISOString().slice(0, 7),
          monthlyBudget: config.monthlyBudget,
          estimatedSpend:
            month._sum.estimatedCostUsd === null && month._count._all > 0
              ? null
              : spend,
          estimatedRemaining:
            config.monthlyBudget === null || unknownMonth > 0
              ? null
              : Math.max(0, config.monthlyBudget - spend),
          unknownCostRequests: unknownMonth,
          providerBalance: null,
        },
        features: features.map((x) => ({
          feature: x.feature,
          requests: x._count._all,
          tokens: (x._sum.inputTokens ?? 0) + (x._sum.outputTokens ?? 0),
          estimatedCostUsd:
            x._sum.estimatedCostUsd === null
              ? null
              : Number(x._sum.estimatedCostUsd),
        })),
        daily: daily.map((x) => ({
          ...x,
          tokens: Number(x.tokens),
          cost: x.cost === null ? null : Number(x.cost),
        })),
        history: history.map((x) => ({
          ...x,
          estimatedCostUsd:
            x.estimatedCostUsd === null ? null : Number(x.estimatedCostUsd),
        })),
      },
      meta: {
        page: query.page,
        total: totals._count._all,
        totalPages: Math.max(1, Math.ceil(totals._count._all / 25)),
      },
    };
  }
  async start(feature: string, model: string) {
    return this.db.client.aiRequest.create({
      data: { feature, model },
      select: { id: true },
    });
  }
  async finish(
    id: string,
    status: 'SUCCEEDED' | 'FAILED',
    durationMs: number,
    usage: Usage | undefined,
    rates: AiSettingsInput,
    httpStatus?: number,
  ) {
    await this.db.client.aiRequest.update({
      where: { id },
      data: {
        status,
        durationMs: Math.min(2147483647, Math.max(0, Math.round(durationMs))),
        completedAt: new Date(),
        ...usage,
        estimatedCostUsd: estimateCost(usage, rates),
        errorCode:
          status === 'SUCCEEDED'
            ? null
            : httpStatus === 429
              ? 'RATE_LIMITED'
              : httpStatus === 401 || httpStatus === 403
                ? 'ACCESS_DENIED'
                : 'EXTRACTION_FAILED',
      },
    });
  }
}
