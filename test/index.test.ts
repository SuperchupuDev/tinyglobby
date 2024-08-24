import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { glob, globSync } from '../src/index.ts';

const cwd = path.join(import.meta.dirname, '../fixtures');

test('directory expansion', async () => {
  const files = await glob({ patterns: ['a'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});

test('empty array matches nothing', async () => {
  const files = await glob({ patterns: [] });
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

  // @ts-expect-error
  assert.throws(() => globSync(['a/*.ts'], { patterns: ['whoops!'], cwd }));
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

test('expandDirectories true', async () => {
  const files = await glob({ patterns: ['a'], expandDirectories: true, cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});

test("no expandDirectories doesn't break common path inferring", async () => {
  const files = await glob({ patterns: ['a/a.ts'], expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.ts']);
});

test("expandDirectories doesn't break common path inferring either", async () => {
  const files = await glob({ patterns: ['a/a.ts'], expandDirectories: true, cwd });
  assert.deepEqual(files.sort(), ['a/a.ts']);
});

test("handle absolute patterns that don't escape the cwd", async () => {
  const files = await glob({ patterns: [`${cwd.replaceAll('\\', '/')}/a/a.ts`], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts']);
});

test('fully handle absolute patterns', async () => {
  const files = await glob({
    patterns: [`${cwd.replaceAll('\\', '/')}/a/a.ts`, `${cwd.replaceAll('\\', '/')}/b/a.ts`],
    cwd: path.join(cwd, 'a')
  });
  assert.deepEqual(files.sort(), ['../b/a.ts', 'a.ts']);
});

test('leading ../', async () => {
  const files = await glob({ patterns: ['../b/*.ts'], cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../b/a.ts', '../b/b.ts']);
});

test('leading ../ plus normal pattern', async () => {
  const files = await glob({ patterns: ['../b/*.ts', 'a.ts'], cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../b/a.ts', '../b/b.ts', 'a.ts']);
});

test('leading ../ with absolute on', async () => {
  const files = await glob({ patterns: ['../b/*.ts'], absolute: true, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}/b/a.ts`, `${cwd.replaceAll('\\', '/')}/b/b.ts`]);
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

  const files3 = await glob({ patterns: ['.deep/a/a/*.ts'], deep: 1, cwd });
  assert.deepEqual(files3.sort(), []);
});

test('deep with ../', async () => {
  const files = await glob({ patterns: ['../.deep/a/a/*.ts', 'a.ts'], deep: 3, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../.deep/a/a/a.ts', 'a.ts']);

  const files2 = await glob({ patterns: ['../.deep/a/a/*.ts', 'a.ts'], deep: 2, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files2.sort(), ['../.deep/a/a/a.ts', 'a.ts']);

  const files3 = await glob({ patterns: ['../.deep/a/a/*.ts', 'a.ts'], deep: 1, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files3.sort(), ['a.ts']);
});

test('absolute', async () => {
  const files = await glob({ patterns: ['a/a.ts'], cwd, absolute: true });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}/a/a.ts`]);
});

test('absolute + dot', async () => {
  const files = await glob({ patterns: ['a/a.ts'], dot: true, cwd: path.join(cwd, '.a'), absolute: true });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}/.a/a/a.ts`]);
});

test('absolute + empty commonPath', async () => {
  const files = await glob({ patterns: ['a/**.ts'], cwd, absolute: true, expandDirectories: false });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}/a/a.ts`, `${cwd.replaceAll('\\', '/')}/a/b.ts`]);
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

test('matching files with specific naming pattern', async () => {
  const files = await glob({ patterns: ['**/[a-c].ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts', 'b/a.ts', 'b/b.ts']);
});

test('using extglob patterns', async () => {
  const files = await glob({ patterns: ['a/*(a|b).ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});

test('pattern normalization', async () => {
  const files1 = await glob({ patterns: ['a'], cwd });
  const files2 = await glob({ patterns: ['a/'], cwd });
  const files3 = await glob({ patterns: ['./a'], cwd });
  assert.deepEqual(files1, files2);
  assert.deepEqual(files1, files3);
});

test('negative patterns in options', async () => {
  const files = await glob({ patterns: ['**/*.ts', '!**/b.ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'b/a.ts']);

  const files2 = await glob({ patterns: ['**/*.ts', '!**/a.ts'], cwd });
  assert.deepEqual(files2.sort(), ['a/b.ts', 'b/b.ts']);
});

test('sync version', () => {
  const files = globSync({ patterns: ['a/*.ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts']);
});

test('sync version with no patterns', () => {
  const files = globSync({ cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts', 'b/a.ts', 'b/b.ts']);
});

test('sync version with no patterns and onlyDirectories', () => {
  const files = globSync({ cwd, onlyDirectories: true });
  assert.deepEqual(files.sort(), ['a/', 'b/']);
});

test('sync version with multiple patterns', () => {
  const files = globSync({ patterns: ['a/*.ts', 'b/*.ts'], cwd });
  assert.deepEqual(files.sort(), ['a/a.ts', 'a/b.ts', 'b/a.ts', 'b/b.ts']);
});

test('sync with empty array matches nothing', () => {
  const files = globSync({ patterns: [] });
  assert.deepEqual(files.sort(), []);
});
