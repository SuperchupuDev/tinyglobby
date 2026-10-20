import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import picomatch from 'picomatch';
import { convertPosixPathToPattern, convertWin32PathToPattern } from '../../src/utils.ts';

for (const platform of ['posix', 'win32']) {
  const convertPathToPattern = platform === 'posix' ? convertPosixPathToPattern : convertWin32PathToPattern;

  describe(`convertPathToPattern (${platform})`, () => {
    test("doesn't add backslashes to already escaped patterns", () => {
      assert.strictEqual(convertPathToPattern('\\['), '\\[');

      if (platform === 'posix') {
        assert.strictEqual(convertPathToPattern('\\|'), '\\|');
      }
    });

    test("doesn't add wrong backslashes", () => {
      assert.strictEqual(convertPathToPattern('hi!@+'), 'hi!@+');
    });

    test('correctly escapes characters', () => {
      assert.strictEqual(convertPathToPattern('!nox'), '\\!nox');
      assert.strictEqual(convertPathToPattern('hi+(@(!())))'), 'hi\\+\\(\\@\\(\\!\\(\\)\\)\\)\\)');

      if (platform === 'posix') {
        assert.strictEqual(convertPathToPattern('\\'), '\\\\');
        assert.strictEqual(convertPathToPattern('meo*w'), 'meo\\*w');
      } else if (platform === 'win32') {
        assert.strictEqual(convertPathToPattern('New Folder (1)'), 'New Folder \\(1\\)');
      }
    });

    if (platform === 'win32') {
      test('converts backslashes correctly', () => {
        assert.strictEqual(convertPathToPattern('\\\\?\\users\\**\\\\[my file\\]'), '//?/users/**/\\[my file\\]');
        assert.strictEqual(convertPathToPattern('hi+(@(!())))'), 'hi\\+\\(\\@\\(\\!\\(\\)\\)\\)\\)');
        assert.strictEqual(
          convertPathToPattern('C:\\Users\\meeee\\New Folder (1)\\**'),
          'C:/Users/meeee/New Folder \\(1\\)/**'
        );
      });

      test('keeps the separator of a segment that starts with a glob character', () => {
        /*
         * The name of a file may start with a glob character, and then the backslash before it is a
         * separator and not an escape. The pattern has to match the file it was made from.
         */
        assert.strictEqual(convertPathToPattern('C:\\Users\\meeee\\(paren.txt'), 'C:/Users/meeee/\\(paren.txt');
        assert.strictEqual(convertPathToPattern('C:\\Users\\meeee\\[bracket].txt'), 'C:/Users/meeee/\\[bracket\\].txt');
        assert.strictEqual(convertPathToPattern('C:\\Users\\meeee\\{brace}.txt'), 'C:/Users/meeee/\\{brace\\}.txt');
        assert.strictEqual(convertPathToPattern('C:\\Users\\meeee\\!bang.txt'), 'C:/Users/meeee/!bang.txt');
        assert.strictEqual(convertPathToPattern('C:\\Users\\meeee\\+plus.txt'), 'C:/Users/meeee/+plus.txt');
        assert.strictEqual(convertPathToPattern('C:\\Users\\meeee\\@at.txt'), 'C:/Users/meeee/@at.txt');
        assert.strictEqual(convertPathToPattern('dir\\(paren.txt'), 'dir/\\(paren.txt');
        assert.strictEqual(convertPathToPattern('C:\\(paren.txt'), 'C:/\\(paren.txt');
      });

      test('keeps the leading backslash of a single segment as an escape', () => {
        // There is no segment before the backslash, so it escapes the character after it.
        assert.strictEqual(convertPathToPattern('\\['), '\\[');
      });

      test('converts the separators of a UNC path', () => {
        assert.strictEqual(convertPathToPattern('\\\\server\\share'), '//server/share');
      });
    }
  });
}

describe('convertPathToPattern', () => {
  test('the pattern matches the path it was made from', () => {
    /*
     * The point of the pattern is to match the path it was made from, so that globbing for the pattern
     * finds the file again.
     */
    const cases: [path: string, entry: string][] = [
      ['/Users/meeee/(paren.txt', '/Users/meeee/(paren.txt'],
      ['/Users/meeee/[bracket].txt', '/Users/meeee/[bracket].txt'],
      ['/Users/meeee/{brace}.txt', '/Users/meeee/{brace}.txt'],
      ['/Users/meeee/normal.txt', '/Users/meeee/normal.txt']
    ];

    for (const [file, entry] of cases) {
      const pattern = convertPosixPathToPattern(file);
      assert.ok(picomatch.isMatch(entry, pattern), `the pattern ${pattern} should match ${entry}`);
    }
  });

  test('the pattern matches a windows path it was made from', () => {
    const cases: [path: string, entry: string][] = [
      ['C:\\Users\\meeee\\(paren.txt', 'C:/Users/meeee/(paren.txt'],
      ['C:\\Users\\meeee\\[bracket].txt', 'C:/Users/meeee/[bracket].txt'],
      ['C:\\Users\\meeee\\{brace}.txt', 'C:/Users/meeee/{brace}.txt'],
      ['C:\\Users\\meeee\\normal.txt', 'C:/Users/meeee/normal.txt']
    ];

    for (const [file, entry] of cases) {
      const pattern = convertWin32PathToPattern(file);
      assert.ok(picomatch.isMatch(entry, pattern), `the pattern ${pattern} should match ${entry}`);
    }
  });
});
