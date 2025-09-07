import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { getPartialMatcher } from '../../src/utils.ts';

describe('getPartialMatcher', () => {
  test('works with exact path', () => {
    const matcher = getPartialMatcher(['test/utils/a']);
    assert.ok(matcher('test/utils/a'));
  });

  test('works with partial path', () => {
    const matcher = getPartialMatcher(['test/utils/a']);
    assert.ok(matcher('test/utils'));
  });

  test("static pattern doesn't give false positives", () => {
    const matcher = getPartialMatcher(['test/utils/a']);
    assert.ok(!matcher('test/utils/b'));
    assert.ok(!matcher('test/tests'));
    assert.ok(!matcher('src'));
  });

  test('works with dynamic pattern', () => {
    const matcher = getPartialMatcher(['test/util?/a']);
    assert.ok(matcher('test/utils'));
  });

  test('works with brace expansion', () => {
    const matcher = getPartialMatcher(['test/{utils,tests}/a']);
    assert.ok(matcher('test/utils/a'));
    assert.ok(matcher('test/tests/a'));
    assert.ok(matcher('test/utils'));
    assert.ok(matcher('test/tests'));

    assert.ok(!matcher('test/other/a'));
    assert.ok(!matcher('test/other'));
  });

  test('works with **', () => {
    const matcher = getPartialMatcher(['test/utils/**']);
    assert.ok(matcher('test'));
    assert.ok(matcher('test/utils'));
    assert.ok(matcher('test/utils/a'));
    assert.ok(matcher('test/utils/a/b/h'));
    assert.ok(!matcher('test/tests/a'));
  });

  test('works with ** (globstar disabled)', () => {
    const matcher = getPartialMatcher(['test/utils/**'], { noglobstar: true });
    assert.ok(matcher('test'));
    assert.ok(matcher('test/utils'));
    assert.ok(matcher('test/utils/a'));
    assert.ok(!matcher('test/utils/a/b/h'));
    assert.ok(!matcher('test/tests/a'));
  });

  test("** doesn't match ..", () => {
    const matcher = getPartialMatcher(['**']);
    assert.ok(!matcher('../hi'));
  });

  test('always match inputs with only parent directories', () => {
    const matcher = getPartialMatcher(['**']);
    assert.ok(matcher('../../..'));
  });

  test('for now treats parts with / as **', () => {
    const matcher = getPartialMatcher(['test/{utils/a,b}']);
    assert.ok(matcher('test'));
    assert.ok(matcher('test/utils'));
    assert.ok(matcher('test/utils/a'));

    // only happens when treating it as **
    assert.ok(matcher('test/notutils'));
    assert.ok(matcher('test/notutils/a'));
  });

  test('works with weird parentheses combinations', () => {
    const matcher = getPartialMatcher(['test/utils/(a)']);
    assert.ok(matcher('test/utils/a'));
    assert.ok(matcher('test/utils'));
    assert.ok(!matcher('test/utils/c'));
  });

  test('dot: true', () => {
    const matcher = getPartialMatcher(['test/utils/*/c'], { dot: true });
    assert.ok(matcher('test/utils/a/c'));
    assert.ok(matcher('test/utils/.a/c'));
    assert.ok(matcher('test/utils'));
  });

  test('dot: false', () => {
    const matcher = getPartialMatcher(['test/utils/*/c']);
    assert.ok(matcher('test/utils/a/c'));
    assert.ok(!matcher('test/utils/.a/c'));
    assert.ok(matcher('test/utils'));
  });

  test('dot: false and **', () => {
    const matcher = getPartialMatcher(['test/utils/**/c']);
    assert.ok(matcher('test/utils/a/c'));
    assert.ok(!matcher('test/utils/.a/c'));
    assert.ok(matcher('test/utils'));
  });

  test('path initially matching pattern but more input than pattern parts', () => {
    const matcher = getPartialMatcher(['test/utils/a']);
    assert.ok(!matcher('test/utils/a/c'));
  });

  test('multiple patterns', () => {
    const matcher = getPartialMatcher(['test/util?/a', 'test/utils/a/c']);
    assert.ok(matcher('test/utils/a/c'));
    assert.ok(matcher('test/utilg/a'));
    assert.ok(matcher('test/utilg'));
    assert.ok(!matcher('test/utilg/a/c'));
  });

  test('patterns that break picomatch.makeRe', () => {
    const matcher = getPartialMatcher(['+++']);
    assert.ok(matcher('+++'));
  });

  test('..', () => {
    const matcher = getPartialMatcher(['../test/util?/a']);
    assert.ok(matcher('..'));
    assert.ok(matcher('../test/utilg/a'));
    assert.ok(!matcher('a/test/utilg/a'));
    assert.ok(!matcher('test/utilg/a'));
  });

  test('.. mixed with normal pattern', () => {
    const matcher = getPartialMatcher(['../test/util?/a', 'src/utils/a']);
    assert.ok(matcher('..'));
    assert.ok(matcher('../test/utilg/a'));
    assert.ok(!matcher('a/test/utilg/a'));
    assert.ok(!matcher('test/utilg/a'));

    assert.ok(matcher('src'));
    assert.ok(matcher('src/utils'));
    assert.ok(!matcher('src/gaming'));
  });
});
