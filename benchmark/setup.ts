import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

try {
  await access(join(import.meta.dirname, 'fixtures', 'typescript-eslint'));
  console.log('No need to clone typescript-eslint, skipping...');
} catch {
  await mkdir(join(import.meta.dirname, 'fixtures'));
  spawn('git', ['clone', '--depth', '1', 'https://github.com/typescript-eslint/typescript-eslint'], {
    cwd: join(import.meta.dirname, 'fixtures')
  });
  console.log('Cloned typescript-eslint');
}
