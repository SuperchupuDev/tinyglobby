import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { glob, globSync } from '../src';

test('path expansion', async () => {
  const files = await glob({ patterns: ['a'], cwd: path.join(__dirname, 'fixtures') });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts'), path.join('a', 'b.ts')]);
});

test('negative patterns', async () => {
  const files = await glob({ patterns: ['**/a.ts', '!b/a.ts'], cwd: path.join(__dirname, 'fixtures') });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts')]);
});

test('ignore option', async () => {
  const files = await glob({ patterns: ['**/a.ts'], ignore: ['b/a.ts'], cwd: path.join(__dirname, 'fixtures') });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts')]);
});

test('bracket expanding', async () => {
  const files = await glob({ patterns: ['a/{a,b}.ts'], cwd: path.join(__dirname, 'fixtures') });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts'), path.join('a', 'b.ts')]);
});

test('no patterns returns everything in cwd', async () => {
  const files = await glob({ cwd: path.join(__dirname, 'fixtures') });
  assert.deepEqual(files.sort(), [
    path.join('a', 'a.ts'),
    path.join('a', 'b.ts'),
    path.join('b', 'a.ts'),
    path.join('b', 'b.ts')
  ]);
});

test('**/* works', async () => {
  const files = await glob({ patterns: ['**/*'], cwd: path.join(__dirname, 'fixtures') });
  assert.deepEqual(files.sort(), [
    path.join('a', 'a.ts'),
    path.join('a', 'b.ts'),
    path.join('b', 'a.ts'),
    path.join('b', 'b.ts')
  ]);
});

test('sync version', () => {
  const files = globSync({ patterns: ['a/*.ts'], cwd: path.join(__dirname, 'fixtures') });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts'), path.join('a', 'b.ts')]);
});
