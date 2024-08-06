import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { glob, globSync } from '../src';

const cwd = path.join(__dirname, '../fixtures');

test('directory expansion', async () => {
  const files = await glob({ patterns: ['a'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});

test('empty array matches nothing', async () => {
  const files = await glob({ patterns: [], cwd });
  assert.deepEqual(files.sort(), []);
});

test('no directory expansion if expandDirectories is set to false', async () => {
  const files = await glob({ patterns: ['a'], expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), []);
});

test('classic patterns as first argument', async () => {
  const files = await glob(['a/*.ts'], { cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});

test("cant have both classic patterns and options' patterns", async () => {
  // @ts-expect-error
  assert.rejects(glob(['a/*.ts'], { patterns: ['whoops!'], cwd }));
});

test('negative patterns', async () => {
  const files = await glob({ patterns: ['**/a.ts', '!b/a.ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts']);
});

test('ignore option', async () => {
  const files = await glob({ patterns: ['**/a.ts'], ignore: ['b/a.ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts']);
});

test('onlyDirectories option', async () => {
  const files = await glob({ patterns: ['a'], onlyDirectories: true, cwd });
  assert.deepEqual(files.sort(), ['a/']);
});

test('onlyFiles option', async () => {
  const files = await glob({ patterns: ['a'], onlyFiles: false, cwd });
  assert.deepEqual(files.sort(), ['a/', 'a/a.ts', 'a/b.ts']);
});

test('onlyDirectories has preference over onlyFiles', async () => {
  const files = await glob({ patterns: ['a'], onlyDirectories: true, onlyFiles: true, cwd });
  assert.deepEqual(files.sort(), ['a/']);
});

test('matching only a directory works', async () => {
  const files = await glob({ patterns: ['a'], onlyFiles: false, expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['a/']);
});

test('bracket expanding', async () => {
  const files = await glob({ patterns: ['a/{a,b}.ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});

test('dot', async () => {
  const files = await glob({ patterns: ['a/a.ts'], dot: true, cwd: path.join(cwd, '.a') });
  assert.deepEqual(files.sort(), ['a/a.ts']);
});

test('deep', async () => {
  const files = await glob({ patterns: ['.deep/a/a/*.ts'], deep: 3, cwd });
  assert.deepEqual(files.sort(), ['.deep/a/a/a.ts']);

  const files2 = await glob({ patterns: ['.deep/a/a/*.ts'], deep: 2, cwd });
  assert.deepEqual(files2.sort(), []);
});

test('absolute + dot', async () => {
  const files = await glob({ patterns: ['a/a.ts'], dot: true, cwd: path.join(cwd, '.a'), absolute: true });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}/.a/a/a.ts`]);
});

test('absolute', async () => {
  const files = await glob({ patterns: ['a/a.ts'], dot: true, cwd: path.join(cwd, '.a'), absolute: true });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}/.a/a/a.ts`]);
});

test('works with non-absolute cwd', async () => {
  const files = await glob({ patterns: ['a/*.ts'], cwd: 'fixtures' });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});

test('no patterns returns everything in cwd', async () => {
  const files = await glob({ cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts', 'b/a.ts', 'b/b.ts']);
});

test('**/* works', async () => {
  const files = await glob({ patterns: ['**/*'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts', 'b/a.ts', 'b/b.ts']);
});

test('sync version', () => {
  const files = globSync({ patterns: ['a/*.ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});
