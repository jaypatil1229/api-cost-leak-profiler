/**
 * Integration test setup.
 * These tests require a live PostgreSQL database configured via DATABASE_URL.
 * Run with: npm run test:integration
 */

beforeAll(() => {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('placeholder')) {
    throw new Error(
      'Integration tests require a real DATABASE_URL. Set it to a test PostgreSQL instance.',
    );
  }
});

afterAll(() => {
  // Graceful cleanup
});
