const { AclpClient } = require('../dist');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(ACLP_API_BASE_URL|ACLP_API_KEY)=(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const apiKey = process.env.ACLP_API_KEY;
if (!apiKey) {
  console.error('Set ACLP_API_KEY to a project key with USAGE_WRITE scope.');
  process.exitCode = 1;
} else {
  const client = new AclpClient({
    baseUrl: process.env.ACLP_API_BASE_URL || 'http://localhost:3000/api/v1',
    apiKey,
    onError(error) {
      // Safe error information only; event payloads and credentials are omitted.
      console.error(`Telemetry delivery ${error.code} for ${error.eventIds.length} event(s).`);
    },
  });

  client.enqueue({
    eventId: `local-example-${Date.now()}`,
    provider: 'GEMINI',
    model: 'gemini-3.8-flash',
    occurredAt: new Date().toISOString(),
    inputTokens: 120,
    outputTokens: 36,
    totalTokens: 156,
    latencyMs: 420,
    status: 'SUCCESS',
    featureId: 'local-example.summary',
    promptHash: 'sha256-example-placeholder',
    promptCharCount: 80,
    metadata: { source: 'aclp-sdk-local-example', operation: 'summary' },
  });

  client.close().then((report) => {
    console.log(`Telemetry flush: accepted=${report.accepted}, duplicate=${report.duplicate}, rejected=${report.rejected}, failed=${report.failed}.`);
    if (report.failed > 0 || report.rejected > 0) process.exitCode = 1;
  }).catch(() => {
    console.error('Telemetry client could not close cleanly.');
    process.exitCode = 1;
  });
}
