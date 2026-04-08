import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ensureNonDriveRelativePath } from '../../src/utils.ts';

describe('ensureNonDriveRelativePath', () => {
  test('keeps normal absolute paths unchanged', () => {
    assert.equal(ensureNonDriveRelativePath('L:/test1/a'), 'L:/test1/a');
  });

  test('already-absolute paths should be unchanged', () => {
    assert.equal(ensureNonDriveRelativePath('L:/'), 'L:/');
  });

  test("Non-Windows paths shouldn't be affected", () => {
    assert.equal(ensureNonDriveRelativePath('/test1/a'), '/test1/a');
  });

  test('converts drive-relative roots to drive-absolute paths', () => {
    assert.equal(ensureNonDriveRelativePath('L:'), 'L:/');
  });
});
