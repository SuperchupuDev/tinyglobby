import { join } from 'node:path';
import { Bench } from 'tinybench';

import { glob as native } from 'node:fs/promises';
import fastGlob from 'fast-glob';
import { glob } from 'glob';
import { glob as tinyglobby } from '../dist/index.mjs';

const bench = new Bench({ name: '**/* (typescript-eslint)' });

bench
  .add('tinyglobby', async () => {
    await tinyglobby('**/*', { expandDirectories: false, cwd: join(import.meta.dirname, 'typescript-eslint') });
  })
  .add('fast-glob', async () => {
    await fastGlob('**/*', { cwd: join(import.meta.dirname, 'typescript-eslint') });
  })
  .add('glob', async () => {
    await glob('**/*', { cwd: join(import.meta.dirname, 'typescript-eslint') });
  })
  .add('node:fs glob', async () => {
    await Array.fromAsync(native('**/*', { cwd: join(import.meta.dirname, 'typescript-eslint') }));
  });

await bench.run();

console.log(bench.name);
console.table(bench.table());
