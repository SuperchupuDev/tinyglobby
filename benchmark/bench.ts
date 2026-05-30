import { access, glob as native } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { styleText } from 'node:util';
import fastGlob from 'fast-glob';
import { glob } from 'glob';
import { Bench } from 'tinybench';
import { glob as tinyglobby } from '../src/index.ts';

try {
  await access(join(import.meta.dirname, 'fixtures', 'typescript-eslint'));
} catch {
  console.error(`${styleText('red', 'Error:')} no benchmark fixtures`);
  console.error(`To generate them, run: ${styleText('blue', 'node --run bench:setup')}`);
  process.exit(1);
}

const bench = new Bench({ name: 'packages/*/tsconfig.json (typescript-eslint)' });
const cwd = join(import.meta.dirname, 'fixtures', 'typescript-eslint');

bench
  .add('tinyglobby', async () => {
    await tinyglobby('packages/*/tsconfig.json', { expandDirectories: false, cwd });
  })
  .add('fast-glob', async () => {
    await fastGlob('packages/*/tsconfig.json', { cwd });
  })
  .add('glob', async () => {
    await glob('packages/*/tsconfig.json', { cwd });
  })
  .add('node:fs glob', async () => {
    await Array.fromAsync(native('packages/*/tsconfig.json', { cwd }));
  });

await bench.run();

console.log(bench.name);
console.table(bench.table());

const bench2 = new Bench({ name: '**/* (typescript-eslint)' });

bench2
  .add('tinyglobby', async () => {
    await tinyglobby('**/*', { expandDirectories: false, cwd });
  })
  .add('fast-glob', async () => {
    await fastGlob('**/*', { cwd });
  })
  .add('glob', async () => {
    await glob('**/*', { cwd });
  })
  .add('node:fs glob', async () => {
    await Array.fromAsync(native('**/*', { cwd }));
  });

await bench2.run();

console.log(bench2.name);
console.table(bench2.table());
