import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

try {
  await access(join(import.meta.dirname, 'typescript-eslint'));
  console.log('No need to clone typescript-eslint, skipping...');
} catch {
  spawn('git', ['clone', '--depth', '1', 'https://github.com/typescript-eslint/typescript-eslint'], {
    cwd: import.meta.dirname
  });
  console.log('Cloned typescript-eslint');
}
