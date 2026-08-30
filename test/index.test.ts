import assert from 'node:assert/strict';
import { readdir } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { createFixture } from 'fs-fixture';
import { escapePath, glob, globSync } from '../src/index.ts';

const isWindows = process.platform === 'win32';

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
  // names windows rejects (`" | * ? \`) only exist on posix, where the tests using them run
  '.deep/static': {
    chars: { '#': '', $: '', $$: '', '%': '', '&': '', '+': '', '++': '', '=': '', '@': '', '^': '', '~': '' },
    brackets: { '[': '', '[+': '', '[a': '', '[ab': '', ...(isWindows ? {} : { '[*': '', '[?': '' }) },
    hoisted: {
      'deep/common/a.d.ts': '',
      'deep/common/a.d.ts.map': '',
      'deep/common/b.d.ts': '',
      'deep/common/src/keep.js': '',
      'deep/common/src/skip.ts': ''
    },
    ...(isWindows
      ? {}
      : {
          backslash: { 'a\\name.txt': 'a' },
          quoted: { plain: '', '"plain"': '', nested: { a: '', 'a|': '' } }
        })
  },
  '.symlink': {
    file: ({ symlink }) => symlink('../a/a.txt'),
    dir: ({ symlink }) => symlink('../a'),
    '.recursive': ({ symlink }) => symlink('..')
  }
});

const cwd = fixture.path;
const escapedCwd = cwd.replaceAll('\\', '/');
// the static pattern fixtures live under `.deep` so the tests that crawl the fixture root stay
// unaffected: they either skip dotfiles or already prune `.deep`
const staticCwd = (dir: string) => path.join(cwd, '.deep/static', dir);

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

test('common path prefix is respected across multiple patterns', async () => {
  const files = await glob(['a/a.txt', 'a/b.txt'], { cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('cwd defaults to process.cwd() evaluated at call time, not import time', async t => {
  t.mock.method(process, 'cwd', () => cwd); // cwd !== importTimeCwd (fixture is in a temp dir)

  const files = await glob('a/*.txt'); // no cwd passed - must use call-time process.cwd()
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('explicit undefined options fall back to defaults', async () => {
  // cwd: undefined should not throw
  await assert.doesNotReject(() => glob('*', { cwd: undefined }));

  // expandDirectories defaults to true - directories should be expanded
  const expandFiles = await glob('a', { cwd, expandDirectories: undefined });
  assert.deepEqual(expandFiles.sort(), ['a/a.txt', 'a/b.txt']);

  // onlyFiles defaults to true - directories should not appear
  const onlyFilesResult = await glob('a', { cwd, onlyFiles: undefined });
  assert.ok(!onlyFilesResult.includes('a/'));

  // caseSensitiveMatch defaults to true - uppercase pattern should not match
  const caseFiles = await glob('**/A.TXT', { cwd, caseSensitiveMatch: undefined });
  assert.deepEqual(caseFiles, []);
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

test('static pattern with missing file', async () => {
  const files = await glob(['a/a.txt', 'a/c.txt'], { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('static pattern overlapping with dynamic pattern', async () => {
  const files = await glob(['a/a.txt', 'a/*.txt'], { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt', 'a/b.txt']);
});

test('static patterns preserve crawler order', () => {
  const expected = globSync('{a/a.txt,b/b.txt}', { expandDirectories: false, cwd });
  const files = globSync(['b/b.txt', 'a/a.txt'], { expandDirectories: false, cwd });
  assert.deepEqual(files, expected);
});

test('static pattern with wrong case matches nothing', async () => {
  const files = await glob('a/A.txt', { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), []);
});

test('static pattern supports case-insensitive matching', async () => {
  const files = await glob('A.TXT', {
    caseSensitiveMatch: false,
    expandDirectories: false,
    cwd: path.join(cwd, 'a')
  });
  assert.deepEqual(files, ['a.txt']);
});

test('static pattern respects deep', async () => {
  const files = await glob('a/a.txt', { deep: 0, expandDirectories: false, cwd });
  assert.deepEqual(files, []);
});

test('static pattern respects aborted signal', async () => {
  const files = await glob('a/a.txt', { signal: AbortSignal.abort(), expandDirectories: false, cwd });
  assert.deepEqual(files, []);
});

test('static pattern supports onlyDirectories', async () => {
  const files = await glob('a', { onlyDirectories: true, expandDirectories: false, cwd });
  assert.deepEqual(files, ['a/']);
});

test('static pattern respects ignore', async () => {
  const files = await glob(['a/a.txt', 'b/a.txt'], { expandDirectories: false, ignore: ['a/**'], cwd });
  assert.deepEqual(files.sort(), ['b/a.txt']);
});

test('static pattern respects ignored directory in mixed input', async () => {
  const files = await glob(['a/a.txt', 'b/*.txt'], { expandDirectories: false, ignore: ['a'], cwd });
  assert.deepEqual(files.sort(), ['b/a.txt', 'b/b.txt']);
});

test('static pattern with absolute option', async () => {
  const files = await glob('a/a.txt', { absolute: true, expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), [`${escapedCwd}/a/a.txt`]);
});

test('static pattern as absolute path', async () => {
  const files = await glob(`${escapedCwd}/a/a.txt`, { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['a/a.txt']);
});

test('static pattern to symlink', async () => {
  const files = await glob('.symlink/file', { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['.symlink/file']);
});

test('static pattern to symlink without followSymbolicLinks', async () => {
  const files = await glob('.symlink/file', { expandDirectories: false, followSymbolicLinks: false, cwd });
  assert.deepEqual(files.sort(), []);
});

test('static pattern to directory symlink matches nothing', async () => {
  const files = await glob('.symlink/dir', { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), []);
});

test('static pattern with escaped symbols', async () => {
  const files = await glob('.\\[a\\]/a.txt', { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['.[a]/a.txt']);
});

test('static pattern with escaped backslash', { skip: isWindows }, async () => {
  const files = await glob(escapePath('a\\name.txt'), { expandDirectories: false, cwd: staticCwd('backslash') });
  assert.deepEqual(files, ['a\\name.txt']);
});

test('static pattern with repeated picomatch syntax', async () => {
  const files = await glob(['$$', '++'], { expandDirectories: false, cwd: staticCwd('chars') });
  assert.deepEqual(files.sort(), ['$', '$$', '+', '++']);
});

test('static pattern with quoted picomatch syntax', { skip: isWindows }, async () => {
  const files = await glob(['"plain"', 'nested/a|'], { expandDirectories: false, cwd: staticCwd('quoted') });
  assert.deepEqual(files.sort(), ['"plain"', 'nested/a', 'nested/a|', 'plain']);
});

test('static pattern with unfinished glob syntax', { skip: isWindows }, async () => {
  const files = await glob('[*', { expandDirectories: false, cwd: staticCwd('brackets') });
  assert.deepEqual(files.sort(), ['[', '[*', '[+', '[?', '[a', '[ab']);
});

test('static pattern to dotted path without dot option', async () => {
  const files = await glob('.a/a/a.txt', { expandDirectories: false, cwd });
  assert.deepEqual(files.sort(), ['.a/a/a.txt']);
});

test('static pattern into parent directory', () => {
  const files = globSync('../a/a.txt', { cwd: path.join(cwd, 'a'), expandDirectories: false });
  assert.deepEqual(files.sort(), ['a.txt']);
});

test('static pattern into sibling directory', () => {
  const files = globSync('../a/a.txt', { cwd: path.join(cwd, 'b'), expandDirectories: false });
  assert.deepEqual(files.sort(), ['../a/a.txt']);
});

test('static pattern below symlink respects followSymbolicLinks in mixed input', async () => {
  const files = await glob(['.symlink/dir/a.txt', 'b/*.txt'], {
    expandDirectories: false,
    followSymbolicLinks: false,
    cwd
  });
  assert.deepEqual(files.sort(), ['b/a.txt', 'b/b.txt']);
});

test('static pattern with fs option', async t => {
  const myCoolReaddir = t.mock.fn(readdir);
  const files = await glob('a/a.txt', {
    fs: {
      readdir: myCoolReaddir
    },
    expandDirectories: false,
    cwd
  });
  assert.deepEqual(files.sort(), ['a/a.txt']);
  assert.equal(myCoolReaddir.mock.callCount() > 0, true);
});

test('many static patterns sharing a hoisted common root', async () => {
  // already sorted, so every pattern resolving to its own file gives back the input
  const patterns = [
    'deep/common/a.d.ts',
    'deep/common/a.d.ts.map',
    'deep/common/b.d.ts',
    'deep/common/src/keep.js',
    'deep/common/src/skip.ts'
  ];
  const files = await glob(patterns, { expandDirectories: false, cwd: staticCwd('hoisted') });
  assert.deepEqual(files.sort(), patterns);
});

test('static pattern with special literal characters', async () => {
  const files = await glob(['$', '^', '@', '%', '#', '&', '=', '~'], {
    expandDirectories: false,
    cwd: staticCwd('chars')
  });
  assert.deepEqual(files.sort(), ['#', '$', '%', '&', '=', '@', '^', '~']);
});

test('static pattern does not match a sibling sharing its prefix', async () => {
  const files = await glob('deep/common/a.d.ts', { expandDirectories: false, cwd: staticCwd('hoisted') });
  assert.deepEqual(files, ['deep/common/a.d.ts']);
});

test('static and dynamic patterns combine under a hoisted root', async () => {
  const files = await glob(['deep/common/a.d.ts', 'deep/common/b.d.ts', 'deep/common/src/*.js'], {
    expandDirectories: false,
    cwd: staticCwd('hoisted')
  });
  assert.deepEqual(files.sort(), ['deep/common/a.d.ts', 'deep/common/b.d.ts', 'deep/common/src/keep.js']);
});

// `|` is alternation rather than a literal, so it must stay on the matcher path on every platform
test('pipe pattern stays dynamic and matches by alternation', async () => {
  const files = await glob(['a/a.txt|'], { expandDirectories: false, cwd });
  assert.deepEqual(files, ['a/a.txt']);
});
