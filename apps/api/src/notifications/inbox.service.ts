import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@saydaliyati/database';
import type { NotificationQuery } from '@saydaliyati/validation';
import { DatabaseService } from '../database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.guard.js';
import { ApiError } from '../auth/errors.js';
const selection = {
  id: true,
  type: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const;
@Injectable()
export class NotificationInbox {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async list(actor: AuthContext, q: NotificationQuery) {
    const where: Prisma.NotificationWhereInput = {
      userId: actor.userId,
      ...(q.unread === undefined
        ? {}
        : { readAt: q.unread ? null : { not: null } }),
    };
    const [data, total] = await this.db.client.$transaction(
      [
        this.db.client.notification.findMany({
          where,
          select: selection,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
        }),
        this.db.client.notification.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data,
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async read(actor: AuthContext, id: string | undefined, requestId: string) {
    return this.db.client.$transaction(async (tx) => {
      await this.auth.authorizeOwnerMutation(tx, actor);
      if (
        id &&
        !(await tx.notification.findFirst({
          where: { id, userId: actor.userId },
          select: { id: true },
        }))
      )
        throw new ApiError('RESOURCE_NOT_FOUND');
      const updated = await tx.notification.updateMany({
        where: { userId: actor.userId, readAt: null, ...(id ? { id } : {}) },
        data: { readAt: new Date() },
      });
      if (updated.count)
        await tx.auditLog.createMany({
          data: [
            {
              actorId: actor.userId,
              resourceType: 'NOTIFICATION',
              resourceId: id ?? actor.userId,
              action: id ? 'NOTIFICATION_READ' : 'NOTIFICATIONS_READ_ALL',
              metadata: {
                requestId,
                result: 'SUCCESS',
                updatedCount: updated.count,
              },
            },
          ],
        });
      return { data: { updatedCount: updated.count }, meta: {} };
    });
  }
}
