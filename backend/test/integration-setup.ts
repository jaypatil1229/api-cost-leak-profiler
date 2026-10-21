import { PrismaClient } from '@prisma/client';

const integrationEnabled = process.env.RUN_POSTGRES_INTEGRATION === '1';

if (!integrationEnabled) {
  console.warn(
    'PostgreSQL integration tests skipped. Use `npm run test:int:safe` with backend/.env.test and the test database running.',
  );
} else {
  beforeAll(async () => {
    const value = process.env.DATABASE_URL;
    if (!value) throw new Error('RUN_POSTGRES_INTEGRATION=1 requires DATABASE_URL.');

    const url = new URL(value);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      database !== 'aclp_test' ||
      decodeURIComponent(url.username) !== 'aclp_test'
    ) {
      throw new Error(
        'Refusing integration test connection: expected loopback aclp_test database/user.',
      );
    }

    const prisma = new PrismaClient();
    try {
      const rows = await prisma.$queryRaw<Array<{ database: string; username: string }>>`
        SELECT current_database() AS database, current_user AS username
      `;
      if (
        rows.length !== 1 ||
        rows[0].database !== 'aclp_test' ||
        rows[0].username !== 'aclp_test'
      ) {
        throw new Error(
          'Refusing integration test connection: connected database identity is not aclp_test.',
        );
      }
    } finally {
      await prisma.$disconnect();
    }
  });
}
