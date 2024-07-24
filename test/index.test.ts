import assert from 'node:assert/strict';
import path, { posix } from 'node:path';
import { test } from 'node:test';
import { glob, globSync } from '../src';

const cwd = path.join(__dirname, 'fixtures');

test('directory expansion', async () => {
  const files = await glob({ patterns: ['a'], cwd });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts'), path.join('a', 'b.ts')]);
});

test('no directory expansion if expandDirectories is set to false', async () => {
  const files = await glob({ patterns: ['a'], expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), []);
});

test('negative patterns', async () => {
  const files = await glob({ patterns: ['**/a.ts', '!b/a.ts'], cwd });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts')]);
});

test('ignore option', async () => {
  const files = await glob({ patterns: ['**/a.ts'], ignore: ['b/a.ts'], cwd });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts')]);
});

test('onlyDirectories option', async () => {
  const files = await glob({ patterns: ['a'], onlyDirectories: true, cwd });
  assert.deepEqual(files.sort(), [`a${path.sep}`]);
});

test('bracket expanding', async () => {
  const files = await glob({ patterns: ['a/{a,b}.ts'], cwd });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts'), path.join('a', 'b.ts')]);
});

test('dot', async () => {
  const files = await glob({ patterns: ['a/a.ts'], dot: true, cwd: path.join(cwd, '.a') });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts')]);
});

test('absolute + dot', async () => {
  const files = await glob({ patterns: ['a/a.ts'], dot: true, cwd: path.join(cwd, '.a'), absolute: true });
  assert.equal(files[0].slice(path.join(cwd, '.a').length + 1), path.join('a', 'a.ts'));
});

test('absolute', async () => {
  const files = await glob({ patterns: ['a/a.ts'], dot: true, cwd: path.join(cwd, '.a'), absolute: true });
  assert.equal(files[0].slice(path.join(cwd, '.a').length + 1), path.join('a', 'a.ts'));
});

test('works with non-absolute cwd', async () => {
  const files = await glob({ patterns: ['a/*.ts'], cwd: 'test/fixtures' });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts'), path.join('a', 'b.ts')]);
});

test('no patterns returns everything in cwd', async () => {
  const files = await glob({ cwd });
  assert.deepEqual(files.sort(), [
    path.join('a', 'a.ts'),
    path.join('a', 'b.ts'),
    path.join('b', 'a.ts'),
    path.join('b', 'b.ts')
  ]);
});

test('**/* works', async () => {
  const files = await glob({ patterns: ['**/*'], cwd });
  assert.deepEqual(files.sort(), [
    path.join('a', 'a.ts'),
    path.join('a', 'b.ts'),
    path.join('b', 'a.ts'),
    path.join('b', 'b.ts')
  ]);
});

test('sync version', () => {
  const files = globSync({ patterns: ['a/*.ts'], cwd });
  assert.deepEqual(files.sort(), [path.join('a', 'a.ts'), path.join('a', 'b.ts')]);
});
