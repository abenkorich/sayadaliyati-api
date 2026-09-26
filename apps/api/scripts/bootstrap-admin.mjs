import { createDatabaseClient } from '@saydaliyati/database';
import { PasswordsService } from '../dist/auth/passwords.service.js';
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  email.length > 320 ||
  !password ||
  [...password].length < 15 ||
  [...password].length > 128
)
  throw new Error(
    'Set valid ADMIN_EMAIL and a 15–128 character ADMIN_PASSWORD in the API .env.',
  );
if (!process.env.MIGRATION_DATABASE_URL)
  throw new Error(
    'MIGRATION_DATABASE_URL is required for administrator provisioning.',
  );
const db = createDatabaseClient(process.env.MIGRATION_DATABASE_URL);
try {
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (existing) {
    if (existing.role !== 'ADMIN')
      throw new Error(
        'This email belongs to a non-admin account. No privileges were changed.',
      );
    console.log(
      'Administrator already exists; password and status were not changed.',
    );
  } else {
    const passwordHash = await new PasswordsService().hash(password);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          resourceId: user.id,
          resourceType: 'USER',
          action: 'ADMIN_BOOTSTRAPPED',
          metadata: { result: 'SUCCESS' },
        },
      });
    });
    console.log(
      'Administrator created. Credentials remain in the API .env file.',
    );
  }
} finally {
  await db.$disconnect();
}
