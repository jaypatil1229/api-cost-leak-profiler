import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '..');
const preloadPath = path.join(scriptDirectory, 'test-runtime-preload.cjs');
const preloadOption = `--require="${preloadPath.replace(/\\/g, '/')}"`;
const nodeOptions = [process.env.NODE_OPTIONS, preloadOption].filter(Boolean).join(' ');
const testFiles = [
  'src/lib/mock-services/repository.test.ts',
  'src/lib/api/client.test.ts',
  'src/lib/api/detection-run-polling.test.ts',
  ...process.argv.slice(2),
];

const result = spawnSync(
  process.execPath,
  [path.join(frontendRoot, 'node_modules/tsx/dist/cli.mjs'), '--test', ...testFiles],
  {
    cwd: frontendRoot,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
    stdio: 'inherit',
  },
);

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
