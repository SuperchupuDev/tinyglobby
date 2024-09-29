import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { escapePosixPath, escapeWin32Path } from '../src/utils.ts';

for (const platform of ['win32', 'posix']) {
  const escapePath = platform === 'posix' ? escapePosixPath : escapeWin32Path;

  describe(`escapePath (${platform})`, () => {
    test("doesn't add backslashes to already escaped patterns", () => {
      assert.strictEqual(escapeWin32Path('\\['), '\\[');

      if (platform === 'posix') {
        assert.strictEqual(escapePath('\\|'), '\\|');
      }
    });

    test("doesn't add wrong backslashes", () => {
      assert.strictEqual(escapePath('hi!@+'), 'hi!@+');
    });

    test('correctly escapes characters', () => {
      assert.strictEqual(escapePath('!nox'), '\\!nox');
      assert.strictEqual(escapePath('hi+(@(!())))'), 'hi\\+\\(\\@\\(\\!\\(\\)\\)\\)\\)');

      if (platform === 'posix') {
        assert.strictEqual(escapePath('\\'), '\\\\');
        assert.strictEqual(escapePath('meo*w'), 'meo\\*w');
      } else if (platform === 'win32') {
        assert.strictEqual(
          escapePath('C:\\Users\\meeee\\New Folder (1)\\**'),
          'C:\\Users\\meeee\\New Folder \\(1\\)\\**'
        );
      }
    });
  });
}
