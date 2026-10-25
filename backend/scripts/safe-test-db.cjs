const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendDir = path.resolve(__dirname, '..');

function loadTestEnvironment() {
  const envFile = path.join(backendDir, '.env.test');
  if (!fs.existsSync(envFile)) {
    throw new Error(
      'Missing backend/.env.test. Copy .env.test.example and set a local test password.',
    );
  }

  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function validateUrl() {
  const value = process.env.DATABASE_URL;
  if (!value || value.includes('replace-with-random-local-test-password')) {
    throw new Error('Set a real random local-only password in backend/.env.test.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL in backend/.env.test is not a valid PostgreSQL URL.');
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const expectedPassword = process.env.ACLP_TEST_POSTGRES_PASSWORD;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Refusing database operation: test database host must be loopback.');
  }
  if (url.port !== '55432') {
    throw new Error('Refusing database operation: test database port must be 55432.');
  }
  if (database !== 'aclp_test' || decodeURIComponent(url.username) !== 'aclp_test') {
    throw new Error('Refusing database operation: expected database and user aclp_test.');
  }
  if (!expectedPassword || expectedPassword.includes('replace-with-')) {
    throw new Error('Set a random local-only ACLP_TEST_POSTGRES_PASSWORD in backend/.env.test.');
  }
  if (decodeURIComponent(url.password) !== expectedPassword) {
    throw new Error('DATABASE_URL password must match ACLP_TEST_POSTGRES_PASSWORD.');
  }
}

async function verifyIdentity() {
  validateUrl();
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows =
      await prisma.$queryRaw`SELECT current_database() AS database, current_user AS username`;
    if (rows.length !== 1 || rows[0].database !== 'aclp_test' || rows[0].username !== 'aclp_test') {
      throw new Error('Refusing database operation: connected server identity is not aclp_test.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

function run(command, args) {
  const result = spawnSync(
    process.execPath,
    [path.resolve(backendDir, 'node_modules', command), ...args],
    {
      cwd: backendDir,
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

async function main() {
  loadTestEnvironment();
  await verifyIdentity();
  const mode = process.argv[2];
  if (mode === 'verify') {
    process.stdout.write(
      'Verified loopback PostgreSQL database identity: aclp_test / aclp_test.\n',
    );
  } else if (mode === 'migrate') {
    run('prisma/build/index.js', ['migrate', 'deploy']);
  } else if (mode === 'integration') {
    process.env.RUN_POSTGRES_INTEGRATION = '1';
    run('jest/bin/jest.js', ['--selectProjects', 'integration', '--runInBand']);
  } else {
    throw new Error('Usage: safe-test-db.cjs <verify|migrate|integration>');
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
