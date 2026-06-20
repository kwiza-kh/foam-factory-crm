import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(viteBin)) {
  console.error('Vite is not installed. Run `npm install` in the project root, then run `npm run dev` again.');
  process.exit(1);
}

const children = [
  spawn(process.execPath, ['server/index.js'], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [viteBin, '--host', '0.0.0.0'], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  }),
];

let shuttingDown = false;

function stopChildren(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill();
  }

  process.exit(exitCode);
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code === 0 || signal) return;
    stopChildren(code || 1);
  });
}

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));
