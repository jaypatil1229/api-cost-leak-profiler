import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('safe test database guard', () => {
  it('rejects the default PostgreSQL port before attempting a connection', () => {
    const testPassword = 'unit-test-only-password';
    const result = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '../scripts/safe-test-db.cjs'), 'verify'],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: `postgresql://aclp_test:${testPassword}@127.0.0.1:5432/aclp_test?schema=public`,
          ACLP_TEST_POSTGRES_PASSWORD: testPassword,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'test database port must be 55432',
    );
  });
});
