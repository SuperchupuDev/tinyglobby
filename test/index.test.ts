import assert from 'node:assert/strict';
import { readdir } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { createFixture } from 'fs-fixture';
import { glob, globSync } from '../src/index.ts';

// object properties are file names and values are file contents
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
  '.[a]/a.txt': 'a',
  '.deep/a/a/a.txt': 'a',
  '.symlink': {
    file: ({ symlink }) => symlink('../a/a.txt'),
    dir: ({ symlink }) => symlink('../a'),
    '.recursive': ({ symlink }) => symlink('..')
  }
});

const cwd = fixture.path;
const escapedCwd = cwd.replaceAll('\\', '/');

after(() => fixture.rm());

test('directory expansion', async () => {
  const files = await glob('a', { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('empty array matches nothing', async () => {
  const files = await glob([]);
  assert.deepEqual(files.sort(), []);
});

test('empty string matches nothing', async () => {
  const files = await glob('', { expandDirectories: false });
  assert.deepEqual(files.sort(), []);
});

test('only double star', async () => {
  const files = await glob('**', { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('no directory expansion if expandDirectories is set to false', async () => {
  const files = await glob('a', { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), []);
});

test('classic patterns as first argument', async () => {
  const files = await glob('a/*.txt', { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test("can't have both classic patterns and options' patterns", async () => {
  // @ts-expect-error
  assert.rejects(glob('a/*.txt', { patterns: 'whoops!', cwd }));

  // @ts-expect-error
  assert.throws(() => globSync('a/*.txt', { patterns: 'whoops!', cwd }));
});

test('negative patterns', async () => {
  const files = await glob(['**/a.txt', '!b/a.txt'], { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('negative patterns setting root as /', async () => {
  const files = await glob(['**/a.txt', '!/b/a.txt'], { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);
});

// only here for coverage reasons really
test('absolutely crawl root', async () => {
  const files = await glob('/', { cwd: '/', onlyDirectories: true, absolute: true, expandDirectories: false });
  assert.deepEqual(files.sort(), [path.resolve('/').replaceAll('\\', '/')]);
});

test('cwd as URL', async () => {
  const files = await glob('a/a.txt', { cwd: new URL(`file://${escapedCwd}`) });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('fs option', async t => {
  const myCoolReaddir = t.mock.fn(readdir);
  const files = await glob('a/a.txt', {
    fs: {
      readdir: myCoolReaddir
    },
    cwd
  });
  assert.deepEqual(files.sort(), ['a/a.txt']);
  assert.equal(myCoolReaddir.mock.callCount() > 0, true);
});

test('fs option with literally nothing inside', async () => {
  const files = await glob('a/a.txt', {
    fs: {},
    cwd
  });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('ignore option', async () => {
  const files = await glob('**/a.txt', { ignore: ['b/a.txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('ignore option as string', async () => {
  const files = await glob('**/a.txt', { ignore: 'b/a.txt', cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('ignore option with an empty string', async () => {
  const files = await glob('**/a.txt', { ignore: '', cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);
});

test('caseSensitiveMatch', async () => {
  const files = await glob('**/A.TXT', { caseSensitiveMatch: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);
});

test('caseSensitiveMatch (default)', async () => {
  const files = await glob('**/A.TXT', { cwd });
  assert.deepEqual(files.sort(), []);
});

test('caseSensitiveMatch with ignore', async () => {
  const files = await glob('**/A.TXT', { ignore: 'B/**', caseSensitiveMatch: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('onlyDirectories option', async () => {
  const files = await glob('a', { onlyDirectories: true, cwd });
  assert.deepEqual(files.sort(), ['a/']);
});

test('onlyFiles option', async () => {
  const files = await glob('a', { onlyFiles: false, cwd });
  assert.deepEqual(files.sort(), ['a/', 'a/a.txt', 'a/b.txt']);
});

test('signal option', async () => {
  const files = await glob('**', { signal: AbortSignal.abort(), cwd, expandDirectories: false });
  assert.deepEqual(files.sort(), []);
});

test('debug option', async t => {
  const { mock } = t.mock.method(console, 'log', () => null);

  const files = await glob('a', { debug: true, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
  assert.equal(mock.callCount(), 11);

  mock.restore();
});

test('onlyDirectories has preference over onlyFiles', async () => {
  const files = await glob('a', { onlyDirectories: true, onlyFiles: true, cwd });
  assert.deepEqual(files.sort(), ['a/']);
});

test('matching only a directory works', async () => {
  const files = await glob('a', { onlyFiles: false, expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['a/']);
});

test('expandDirectories true', async () => {
  const files = await glob('a', { expandDirectories: true, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test("no expandDirectories doesn't break common path inferring", async () => {
  const files = await glob('a/a.txt', { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test("expandDirectories doesn't break common path inferring either", async () => {
  const files = await glob('a/a.txt', { expandDirectories: true, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test("handle absolute patterns that don't escape the cwd", async () => {
  const files = await glob(`${escapedCwd}/a/a.txt`, { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('fully handle absolute patterns', async () => {
  const files = await glob([`${escapedCwd}/a/a.txt`, `${escapedCwd}/b/a.txt`], { cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../b/a.txt', 'a.txt']);
});

test('escaped absolute patterns', async () => {
  const files = await glob(`${escapedCwd}/.\\[a\\]/a.txt`, { absolute: true, cwd: path.join(cwd, '.[a]') });
  assert.deepEqual(files.sort(), [`${escapedCwd}/.[a]/a.txt`]);
});

test('leading ../', async () => {
  const files = await glob('../b/*.txt', { cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../b/a.txt', '../b/b.txt']);
});

test('leading ../ with only dirs', async () => {
  const files = await glob('../.a/*', { cwd: path.join(cwd, 'a'), onlyDirectories: true, expandDirectories: false });
  assert.deepEqual(files.sort(), ['../.a/a/']);
});

test('leading ../ plus normal pattern', async () => {
  const files = await glob(['../b/*.txt', 'a.txt'], { cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../b/a.txt', '../b/b.txt', 'a.txt']);
});

test('leading ../ with absolute on', async () => {
  const files = await glob('../b/*.txt', { absolute: true, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), [`${escapedCwd}/b/a.txt`, `${escapedCwd}/b/b.txt`]);
});

test('brace expansion', async () => {
  const files = await glob('a/{a,b}.txt', { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('braceExpansion false', async () => {
  const files = await glob('a/{a,b}.txt', { cwd, braceExpansion: false });
  assert.deepEqual(files.sort(), []);
});

test('dot', async () => {
  const files = await glob('a/a.txt', { dot: true, cwd: path.join(cwd, '.a') });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('no common path optimization', async () => {
  const files = await glob(['.deep/a/a/*.txt', 'a/a.*'], { cwd });
  assert.deepEqual(files.sort(), ['.deep/a/a/a.txt', 'a/a.txt']);
});

test('deep', async () => {
  const files = await glob('.deep/a/a/*.txt', { deep: 3, cwd });
  assert.deepEqual(files.sort(), ['.deep/a/a/a.txt']);

  const files2 = await glob('.deep/a/a/*.txt', { deep: 2, cwd });
  assert.deepEqual(files2.sort(), []);

  const files3 = await glob('.deep/a/a/*.txt', { deep: 1, cwd });
  assert.deepEqual(files3.sort(), []);
});

test('deep: 0', async () => {
  const files = await glob('a/*.txt', { deep: 0, cwd });
  assert.deepEqual(files.sort(), []);

  const files2 = await glob('*.txt', { deep: 0, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files2.sort(), ['a.txt', 'b.txt']);
});

test('deep with ../', async () => {
  const files = await glob(['../.deep/a/a/*.txt', 'a.txt'], { deep: 3, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files.sort(), ['../.deep/a/a/a.txt', 'a.txt']);

  const files2 = await glob(['../.deep/a/a/*.txt', 'a.txt'], { deep: 2, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files2.sort(), ['../.deep/a/a/a.txt', 'a.txt']);

  const files3 = await glob(['../.deep/a/a/*.txt', 'a.txt'], { deep: 1, cwd: path.join(cwd, 'a') });
  assert.deepEqual(files3.sort(), ['a.txt']);
});

test('globstar false', async () => {
  const files = await glob('.deep/**/*.txt', { cwd, expandDirectories: false, globstar: false });
  assert.deepEqual(files.sort(), []);
});

test('globstar false with expandDirectories', async () => {
  const files = await glob('.deep', { cwd, globstar: false });
  assert.deepEqual(files.sort(), []);
});

test('absolute', async () => {
  const files = await glob('a/a.txt', { cwd, absolute: true });
  assert.deepEqual(files.sort(), [`${escapedCwd}/a/a.txt`]);
});

test('absolute + dot', async () => {
  const files = await glob('a/a.txt', { dot: true, cwd: path.join(cwd, '.a'), absolute: true });
  assert.deepEqual(files.sort(), [`${escapedCwd}/.a/a/a.txt`]);
});

test('absolute + empty commonPath', async () => {
  const files = await glob('a/**.txt', { cwd, absolute: true, expandDirectories: false });
  assert.deepEqual(files.sort(), [`${escapedCwd}/a/a.txt`, `${escapedCwd}/a/b.txt`]);
});

test('handle symlinks', async () => {
  const files = await glob('.symlink/**', { cwd });
  assert.deepEqual(files.sort(), ['.symlink/dir/a.txt', '.symlink/dir/b.txt', '.symlink/file']);
});

test('handle recursive symlinks', async () => {
  const files = await glob(['.symlink/.recursive/**', '!.symlink/.recursive/**/.{a,deep}'], { dot: true, cwd });
  assert.deepEqual(files.sort(), [
    '.symlink/.recursive/.[a]/a.txt',
    '.symlink/.recursive/.symlink/file',
    '.symlink/.recursive/a/a.txt',
    '.symlink/.recursive/a/b.txt',
    '.symlink/.recursive/b/a.txt',
    '.symlink/.recursive/b/b.txt'
  ]);
});

test('handle symlinks (absolute)', async () => {
  const files = await glob('.symlink/**', { absolute: true, cwd });
  assert.deepEqual(files.sort(), [
    `${escapedCwd}/.symlink/dir/a.txt`,
    `${escapedCwd}/.symlink/dir/b.txt`,
    `${escapedCwd}/.symlink/file`
  ]);
});

test('handle recursive symlinks (absolute)', async () => {
  const files = await glob(['.symlink/.recursive/**', '!.symlink/.recursive/**/.{a,deep}'], {
    absolute: true,
    dot: true,
    cwd
  });
  assert.deepEqual(files.sort(), [
    `${escapedCwd}/.symlink/.recursive/.[a]/a.txt`,
    `${escapedCwd}/.symlink/.recursive/.symlink/file`,
    `${escapedCwd}/.symlink/.recursive/a/a.txt`,
    `${escapedCwd}/.symlink/.recursive/a/b.txt`,
    `${escapedCwd}/.symlink/.recursive/b/a.txt`,
    `${escapedCwd}/.symlink/.recursive/b/b.txt`
  ]);
});

test('exclude symlinks if the option is disabled', async () => {
  const files = await glob('.symlink/**', {
    dot: true,
    followSymbolicLinks: false,
    expandDirectories: false,
    cwd
  });
  assert.deepEqual(files.sort(), []);
});

test('. works', async () => {
  const files = await glob('.', { cwd, expandDirectories: false, onlyDirectories: true });
  assert.deepEqual(files.sort(), ['.']);
});

test('. works (absolute)', async () => {
  const files = await glob('.', { cwd, absolute: true, expandDirectories: false, onlyDirectories: true });
  assert.deepEqual(files.sort(), [`${escapedCwd}/`]);
});

test('works with non-absolute cwd', async () => {
  const files = await glob('index.test.ts', { cwd: 'test' });
  assert.deepEqual(files.sort(), ['index.test.ts']);
});

test('no patterns returns everything in cwd', async () => {
  const files = await glob({ cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('**/* works', async () => {
  const files = await glob('**/*', { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('matching files with specific naming pattern', async () => {
  const files = await glob('**/[a-c].txt', { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('dynamic patterns that include slashes inside parts', async () => {
  const files = await glob('{.a/a,a}/a.txt', { cwd });
  assert.deepEqual(files.sort(), ['.a/a/a.txt', 'a/a.txt']);
});

test('using extglob patterns', async () => {
  const files = await glob('a/+(a|b).txt', { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('extglob false', async () => {
  const files = await glob('a/+(a|b).txt', { cwd, extglob: false });
  assert.deepEqual(files.sort(), []);
});

test('using negated bracket expression', async () => {
  const files = await glob('**/[!a].*', { cwd });
  assert.deepEqual(files.sort(), ['a/b.txt', 'b/b.txt']);
});

test('pattern normalization', async () => {
  const files1 = await glob('a', { cwd });
  const files2 = await glob('a/', { cwd });
  const files3 = await glob('./a', { cwd });
  assert.deepEqual(files1, files2);
  assert.deepEqual(files1, files3);
});

test('negative patterns in options', async () => {
  const files = await glob(['**/*.txt', '!**/b.txt'], { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);

  const files2 = await glob(['**/*.txt', '!**/a.txt'], { cwd });
  assert.deepEqual(files2.sort(), ['a/b.txt', 'b/b.txt']);
});

test('negative absolute patterns in options', async () => {
  const files = await glob([`${escapedCwd}/**/*.txt`, `!${escapedCwd}/**/b.txt`], { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);

  const files2 = await glob([`${escapedCwd}/**/*.txt`, `!${escapedCwd}/**/a.txt`], { cwd });
  assert.deepEqual(files2.sort(), ['a/b.txt', 'b/b.txt']);
});

// can't easily make them properly work right now
// but at least it's consistent with fast-glob this way
test('negative patterns in ignore are ignored', async () => {
  const files = await glob('**/*', { ignore: ['**/b.txt', '!a/b.txt'], cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'b/a.txt']);

  const files2 = await glob(['**/*', '!**/b.txt', '!!a/b.txt'], { cwd });
  assert.deepEqual(files2.sort(), ['a/a.txt', 'b/a.txt']);
});

test('sync version', () => {
  const files = globSync('a/*.txt', { cwd });
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
  const files = globSync(['a/*.txt', 'b/*.txt'], { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt', 'b/a.txt', 'b/b.txt']);
});

test('sync with empty array matches nothing', () => {
  const files = globSync([]);
  assert.deepEqual(files.sort(), []);
});

test('*', async () => {
  const files = await glob('./*', { cwd, onlyDirectories: true, expandDirectories: false });
  assert.deepEqual(files.sort(), ['a/', 'b/']);
});

test('.a/*', async () => {
  const files = await glob('.a/*', { cwd, onlyDirectories: true, expandDirectories: false });
  assert.deepEqual(files.sort(), ['.a/a/']);
});

test('. + .a/*', async () => {
  const files = await glob(['.', '.a/*'], { cwd, onlyDirectories: true, expandDirectories: false });
  assert.deepEqual(files.sort(), ['.', '.a/a/']);
});

test('relative self', () => {
  const files = globSync('../a/*', { cwd: path.join(cwd, 'a'), expandDirectories: false });
  assert.deepEqual(files.sort(), ['a.txt', 'b.txt']);
});

test('relative self (two layers)', () => {
  const files = globSync('../../.a/a/*', { cwd: path.join(cwd, '.a/a'), expandDirectories: false });
  assert.deepEqual(files.sort(), ['a.txt']);
});

test('relative self that points to .', () => {
  const files = globSync('../a', { cwd: path.join(cwd, 'a'), onlyDirectories: true, expandDirectories: false });
  assert.deepEqual(files.sort(), ['.']);
});

test('relative self + normal pattern', () => {
  const files = globSync(['../.a', 'a/a.txt'], {
    cwd: path.join(cwd, '.a'),
    onlyFiles: false,
    expandDirectories: false
  });
  assert.deepEqual(files.sort(), ['.', 'a/a.txt']);
});
