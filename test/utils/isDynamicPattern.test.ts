import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isDynamicPattern } from '../../src/utils.ts';

describe('isDynamicPattern', () => {
  test('returns false on an empty string', () => {
    assert.ok(!isDynamicPattern(''));
  });

  test('returns true if case sensitivity is disabled', () => {
    assert.ok(isDynamicPattern('dfhghkfdgn', { caseSensitiveMatch: false }));
  });

  test('returns true on glob symbols', () => {
    assert.ok(isDynamicPattern('*'));
    assert.ok(isDynamicPattern('?'));
    assert.ok(isDynamicPattern('src/*'));
    assert.ok(isDynamicPattern('src/?'));
    assert.ok(isDynamicPattern('!src'));
  });

  test('returns true on regex groups', () => {
    assert.ok(isDynamicPattern('(a|b)'));
    assert.ok(isDynamicPattern('(a|)'));
    assert.ok(isDynamicPattern('a/(a|b)'));
  });

  test('returns true on character classes', () => {
    assert.ok(isDynamicPattern('[ab]'));
    assert.ok(isDynamicPattern('[^ab]'));
    assert.ok(isDynamicPattern('[1-3]'));
    assert.ok(isDynamicPattern('[[:alpha:]'));
  });

  test('returns true on extglobs', () => {
    assert.ok(isDynamicPattern('@()'));
    assert.ok(isDynamicPattern('@(a)'));
    assert.ok(isDynamicPattern('@(a|b)'));
    assert.ok(isDynamicPattern('a!(a|b)'));
    assert.ok(isDynamicPattern('*(a|b)'));
    assert.ok(isDynamicPattern('?(a|b)'));
    assert.ok(isDynamicPattern('+(a|b)'));
  });

  test('returns true on brace expansions', () => {
    assert.ok(isDynamicPattern('{a,b}'));
    assert.ok(isDynamicPattern('{a,}'));
    assert.ok(isDynamicPattern('{1..3}'));
    assert.ok(isDynamicPattern('{1..3..5}'));
  });

  test('returns false on "!" symbols that aren\'t the first character', () => {
    assert.ok(!isDynamicPattern('hi!'));
  });

  test('returns false on static patterns', () => {
    assert.ok(!isDynamicPattern('.'));
    assert.ok(!isDynamicPattern('hiiii'));
    assert.ok(!isDynamicPattern('src/index.ts'));
  });

  test('returns true on unfinished glob patterns unlike fast-glob', () => {
    assert.ok(isDynamicPattern('+(a'));
    assert.ok(isDynamicPattern('(b'));
  });

  test('returns true on some unfinished brace expansions unlike fast-glob', () => {
    assert.ok(isDynamicPattern('{a,b'));
    assert.ok(isDynamicPattern('{1..2'));
    assert.ok(isDynamicPattern('{1..2..3'));
  });

  test('returns false on every other unfinished pattern', () => {
    assert.ok(!isDynamicPattern('[a'));
    assert.ok(!isDynamicPattern('{b'));
  });

  test('doesn\'t return true on patterns that include backslashes unlike fast-glob', () => {
    assert.ok(!isDynamicPattern('\\'));
    assert.ok(!isDynamicPattern('this is my favorite character: \\('));
  });
});
