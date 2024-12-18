import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';
import { createFixture } from 'fs-fixture';
import { glob, globSync } from '../src/index.ts';

const fixture = await createFixture({
  a: {
    'a.txt': 'a',
    'b.txt': 'b'
  },
  b: {
    'a.txt': 'a',
    'b.txt': 'b'
  },
  '.a/a/a.txt': 'a',
  '.deep/a/a/a.txt': 'a',
  '.symlink': {
    file: ({ symlink }) => symlink('../a/a.txt'),
    dir: ({ symlink }) => symlink('../a'),
    '.recursive': ({ symlink }) => symlink('..')
  }
});

const cwd = fixture.path;

after(() => fixture.rm());

test('directory expansion', async () => {
  const files = await glob({ patterns: ['a'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('empty array matches nothing', async () => {
  const files = await glob({ patterns: [] });
  assert.deepEqual(files.sort(), []);
});

test('only double star', async () => {
  const files = await glob({ patterns: ['**'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('no directory expansion if expandDirectories is set to false', async () => {
  const files = await glob({ patterns: ['a'], expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), []);
});

test('classic patterns as first argument', async () => {
  const files = await glob(['a/*.txt'], { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test("cant have both classic patterns and options' patterns", async () => {
  // @ts-expect-error
  assert.rejects(glob(['a/*.txt'], { patterns: ['whoops!'], cwd }));

  // @ts-expect-error
  assert.throws(() => globSync(['a/*.txt'], { patterns: ['whoops!'], cwd }));
});

test('negative patterns', async () => {
  const files = await glob({ patterns: ['**/a.txt', '!b/a.txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('patterns as string', async () => {
  const files = await glob('a/a.txt', { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('ignore option', async () => {
  const files = await glob({ patterns: ['**/a.txt'], ignore: ['b/a.txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('ignore option as string', async () => {
  const files = await glob({ patterns: ['**/a.txt'], ignore: 'b/a.txt', cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('caseSensitiveMatch', async () => {
  const files = await glob({ patterns: ['**/A.TXT'], caseSensitiveMatch: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);
});

test('caseSensitiveMatch (default)', async () => {
  const files = await glob({ patterns: ['**/A.TXT'], cwd });
  assert.deepEqual(files.sort(), []);
});

test('caseSensitiveMatch with ignore', async () => {
  const files = await glob({ patterns: ['**/A.TXT'], ignore: ['B/**'], caseSensitiveMatch: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('onlyDirectories option', async () => {
  const files = await glob({ patterns: ['a'], onlyDirectories: true, cwd });
  assert.deepEqual(files.sort(), ['a/']);
});

test('onlyFiles option', async () => {
  const files = await glob({ patterns: ['a'], onlyFiles: false, cwd });
  assert.deepEqual(files.sort(), ['a/', 'a/a.txt', 'a/b.txt']);
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
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test("no expandDirectories doesn't break common path inferring", async () => {
  const files = await glob({ patterns: ['a/a.txt'], expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test("expandDirectories doesn't break common path inferring either", async () => {
  const files = await glob({ patterns: ['a/a.txt'], expandDirectories: true, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test("handle absolute patterns that don't escape the cwd", async () => {
  const files = await glob({ patterns: [`${cwd.replaceAll('\\', '/')}a/a.txt`], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('fully handle absolute patterns', async () => {
  const files = await glob({
    patterns: [`${cwd.replaceAll('\\', '/')}a/a.txt`, `${cwd.replaceAll('\\', '/')}b/a.txt`],
    cwd: path.join(cwd, 'a')
  });
  assert.deepEqual(files.sort(), ['../b/a.txt', 'a.txt']);
});

test('leading ../', async () => {
  const files = await glob({ patterns: ['../b/*.txt'], cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../b/a.txt', '../b/b.txt']);
});

test('leading ../ plus normal pattern', async () => {
  const files = await glob({ patterns: ['../b/*.txt', 'a.txt'], cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../b/a.txt', '../b/b.txt', 'a.txt']);
});

test('leading ../ with absolute on', async () => {
  const files = await glob({ patterns: ['../b/*.txt'], absolute: true, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}b/a.txt`, `${cwd.replaceAll('\\', '/')}b/b.txt`]);
});

test('bracket expanding', async () => {
  const files = await glob({ patterns: ['a/{a,b}.txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('dot', async () => {
  const files = await glob({ patterns: ['a/a.txt'], dot: true, cwd: path.join(cwd, '.a') });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('no common path optimization', async () => {
  const files = await glob({ patterns: ['.deep/a/a/*.txt', 'a/a.*'], cwd });
  assert.deepEqual(files.sort(), ['.deep/a/a/a.txt', 'a/a.txt']);
});

test('deep', async () => {
  const files = await glob({ patterns: ['.deep/a/a/*.txt'], deep: 3, cwd });
  assert.deepEqual(files.sort(), ['.deep/a/a/a.txt']);

  const files2 = await glob({ patterns: ['.deep/a/a/*.txt'], deep: 2, cwd });
  assert.deepEqual(files2.sort(), []);

  const files3 = await glob({ patterns: ['.deep/a/a/*.txt'], deep: 1, cwd });
  assert.deepEqual(files3.sort(), []);
});

test('deep with ../', async () => {
  const files = await glob({ patterns: ['../.deep/a/a/*.txt', 'a.txt'], deep: 3, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../.deep/a/a/a.txt', 'a.txt']);

  const files2 = await glob({ patterns: ['../.deep/a/a/*.txt', 'a.txt'], deep: 2, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files2.sort(), ['../.deep/a/a/a.txt', 'a.txt']);

  const files3 = await glob({ patterns: ['../.deep/a/a/*.txt', 'a.txt'], deep: 1, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files3.sort(), ['a.txt']);
});

test('absolute', async () => {
  const files = await glob({ patterns: ['a/a.txt'], cwd, absolute: true });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}a/a.txt`]);
});

test('absolute + dot', async () => {
  const files = await glob({ patterns: ['a/a.txt'], dot: true, cwd: path.join(cwd, '.a'), absolute: true });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}.a/a/a.txt`]);
});

test('absolute + empty commonPath', async () => {
  const files = await glob({ patterns: ['a/**.txt'], cwd, absolute: true, expandDirectories: false });
  assert.deepEqual(files.sort(), [`${cwd.replaceAll('\\', '/')}a/a.txt`, `${cwd.replaceAll('\\', '/')}a/b.txt`]);
});

test('handle symlinks', async () => {
  const files = await glob({ patterns: ['.symlink/**'], cwd });
  assert.deepEqual(files.sort(), ['.symlink/dir/a.txt', '.symlink/dir/b.txt', '.symlink/file']);
});

test('handle recursive symlinks', async () => {
  const files = await glob({
    patterns: ['.symlink/.recursive/**', '!.symlink/.recursive/**/.{a,deep}'],
    dot: true,
    cwd
  });
  assert.deepEqual(files.sort(), [
    '.symlink/.recursive/.symlink/file',
    '.symlink/.recursive/a/a.txt',
    '.symlink/.recursive/a/b.txt',
    '.symlink/.recursive/b/a.txt',
    '.symlink/.recursive/b/b.txt'
  ]);
});

test('handle symlinks (absolute)', async () => {
  const files = await glob({ patterns: ['.symlink/**'], absolute: true, cwd });
  assert.deepEqual(files.sort(), [
    `${cwd.replaceAll('\\', '/')}.symlink/dir/a.txt`,
    `${cwd.replaceAll('\\', '/')}.symlink/dir/b.txt`,
    `${cwd.replaceAll('\\', '/')}.symlink/file`
  ]);
});

test('handle recursive symlinks (absolute)', async () => {
  const files = await glob({
    patterns: ['.symlink/.recursive/**', '!.symlink/.recursive/**/.{a,deep}'],
    absolute: true,
    dot: true,
    cwd
  });
  assert.deepEqual(files.sort(), [
    `${cwd.replaceAll('\\', '/')}.symlink/.recursive/.symlink/file`,
    `${cwd.replaceAll('\\', '/')}.symlink/.recursive/a/a.txt`,
    `${cwd.replaceAll('\\', '/')}.symlink/.recursive/a/b.txt`,
    `${cwd.replaceAll('\\', '/')}.symlink/.recursive/b/a.txt`,
    `${cwd.replaceAll('\\', '/')}.symlink/.recursive/b/b.txt`
  ]);
});

test('exclude symlinks if the option is disabled', async () => {
  const files = await glob({
    patterns: ['.symlink/**'],
    dot: true,
    followSymbolicLinks: false,
    expandDirectories: false,
    cwd
  });
  assert.deepEqual(files.sort(), []);
});

test('. works', async () => {
  const files = await glob(['.'], { cwd, expandDirectories: false, onlyDirectories: true });
  assert.deepEqual(files.sort(), ['.']);
});

test('. works (absolute)', async () => {
  const files = await glob(['.'], { cwd, absolute: true, expandDirectories: false, onlyDirectories: true });
  assert.deepEqual(files.sort(), [cwd.replaceAll('\\', '/')]);
});

test('works with non-absolute cwd', async () => {
  const files = await glob({ patterns: ['index.test.ts'], cwd: 'test' });
  assert.deepEqual(files.sort(), ['index.test.ts']);
});

test('no patterns returns everything in cwd', async () => {
  const files = await glob({ cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('**/* works', async () => {
  const files = await glob({ patterns: ['**/*'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('matching files with specific naming pattern', async () => {
  const files = await glob({ patterns: ['**/[a-c].txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('using extglob patterns', async () => {
  const files = await glob({ patterns: ['a/*(a|b).txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('pattern normalization', async () => {
  const files1 = await glob({ patterns: ['a'], cwd });
  const files2 = await glob({ patterns: ['a/'], cwd });
  const files3 = await glob({ patterns: ['./a'], cwd });
  assert.deepEqual(files1, files2);
  assert.deepEqual(files1, files3);
});

test('negative patterns in options', async () => {
  const files = await glob({ patterns: ['**/*.txt', '!**/b.txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);

  const files2 = await glob({ patterns: ['**/*.txt', '!**/a.txt'], cwd });
  assert.deepEqual(files2.sort(), ['a/b.txt', 'b/b.txt']);
});

test('negative absolute patterns in options', async () => {
  const files = await glob({
    patterns: [`${cwd.replaceAll('\\', '/')}**/*.txt`, `!${cwd.replaceAll('\\', '/')}**/b.txt`],
    cwd
  });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);

  const files2 = await glob({
    patterns: [`${cwd.replaceAll('\\', '/')}**/*.txt`, `!${cwd.replaceAll('\\', '/')}**/a.txt`],
    cwd
  });
  assert.deepEqual(files2.sort(), ['a/b.txt', 'b/b.txt']);
});

// can't easily make them properly work right now
// but at least it's consistent with fast-glob this way
test('negative patterns in ignore are ignored', async () => {
  const files = await glob({ patterns: ['**/*'], ignore: ['**/b.txt', '!a/b.txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);

  const files2 = await glob({ patterns: ['**/*', '!**/b.txt', '!!a/b.txt'], cwd });
  assert.deepEqual(files2.sort(), ['a/a.txt', 'b/a.txt']);
});

test('sync version', () => {
  const files = globSync(['a/*.txt'], { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('sync version with no patterns', () => {
  const files = globSync({ cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('sync version with no patterns and onlyDirectories', () => {
  const files = globSync({ cwd, onlyDirectories: true });
  assert.deepEqual(files.sort(), ['a/', 'b/']);
});

test('sync version with multiple patterns', () => {
  const files = globSync({ patterns: ['a/*.txt', 'b/*.txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('sync with empty array matches nothing', () => {
  const files = globSync({ patterns: [] });
  assert.deepEqual(files.sort(), []);
});

test('*', async () => {
  const files = await glob({ patterns: ['./*'], cwd, onlyDirectories: true, expandDirectories: false });
  assert.deepEqual(files.sort(), ['a/', 'b/']);
});

test('.a/*', async () => {
  const files = await glob({ patterns: ['.a/*'], cwd, onlyDirectories: true, expandDirectories: false });
  assert.deepEqual(files.sort(), ['.a/a/']);
});

test('. + .a/*', async () => {
  const files = await glob({ patterns: ['.', '.a/*'], cwd, onlyDirectories: true, expandDirectories: false });
  assert.deepEqual(files.sort(), ['.', '.a/a/']);
});
