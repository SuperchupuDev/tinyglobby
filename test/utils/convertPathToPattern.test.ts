import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
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
    }
  });
}
