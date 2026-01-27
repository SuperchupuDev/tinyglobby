import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createFixture } from 'fs-fixture';
import { sortFiles, sortFilesByPatternPrecedence } from '../src/sort.ts';
import type { GlobInput } from '../src/types.ts';

const fixture = await createFixture({
  common: {
    'Button.js': 'a',
    'Card.js': 'a'
  },
  overrides: {
    'Button.js': 'b'
  }
});

const cwd = fixture.path;
const escapedCwd = cwd.replaceAll('\\', '/');
const options = {
  cwd,
  absolute: true,
  onlyFiles: true,
  expandDirectories: false
} satisfies GlobInput;
const patterns = [
  `overrides/**/*.js`, // Highest priority
  'common/**/*.js' // Normal priority
];

after(() => fixture.rm());

test('sort files without sort', () => {
  const files = [`${escapedCwd}/overrides/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/common/Button.js`];
  assert.deepEqual(sortFiles(files, patterns, options), [
    `${escapedCwd}/overrides/Button.js`,
    `${escapedCwd}/common/Card.js`,
    `${escapedCwd}/common/Button.js`
  ]);
});
test('sort files ascending', () => {
  const files = [`${escapedCwd}/overrides/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/common/Button.js`];
  const useOptions = { ...options, sort: 'asc' } satisfies GlobInput;
  assert.deepEqual(sortFiles(files, patterns, useOptions), [
    `${escapedCwd}/common/Button.js`,
    `${escapedCwd}/common/Card.js`,
    `${escapedCwd}/overrides/Button.js`
  ]);
});
test('sort files descending', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/overrides/Button.js`];
  const useOptions = { ...options, sort: 'desc' } satisfies GlobInput;
  assert.deepEqual(sortFiles(files, patterns, useOptions), [
    `${escapedCwd}/overrides/Button.js`,
    `${escapedCwd}/common/Card.js`,
    `${escapedCwd}/common/Button.js`
  ]);
});
test('sort files by precedence without sort', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/overrides/Button.js`];
  assert.deepEqual(
    [...sortFilesByPatternPrecedence(files, patterns, options)],
    [`${escapedCwd}/overrides/Button.js`, `${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`]
  );
});
test('sort files by precedence with sort ascending (no sort)', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/overrides/Button.js`];
  const useOptions = { ...options, sort: 'asc' } satisfies GlobInput;
  assert.deepEqual(
    [...sortFilesByPatternPrecedence(files, patterns, useOptions)],
    [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/overrides/Button.js`]
  );
});
test('sort files by precedence', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/overrides/Button.js`];
  const useOptions = { ...options, sort: 'pattern' } satisfies GlobInput;
  assert.deepEqual(
    [...sortFilesByPatternPrecedence(files, patterns, useOptions)],
    [`${escapedCwd}/overrides/Button.js`, `${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`]
  );
});
test('sort files by precedence with no sort', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/overrides/Button.js`];
  assert.deepEqual(
    [...sortFilesByPatternPrecedence(files, patterns, options)],
    [`${escapedCwd}/overrides/Button.js`, `${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`]
  );
});
test('sort files by precedence ascending', () => {
  const files = [`${escapedCwd}/common/Card.js`, `${escapedCwd}/common/Button.js`, `${escapedCwd}/overrides/Button.js`];
  const result = [
    `${escapedCwd}/overrides/Button.js`,
    `${escapedCwd}/common/Button.js`,
    `${escapedCwd}/common/Card.js`
  ];
  const useOptions = { ...options, sort: 'pattern-asc' } satisfies GlobInput;
  assert.deepEqual([...sortFilesByPatternPrecedence(files, patterns, useOptions)], result);
  assert.deepEqual(sortFiles(files, patterns, useOptions), result);
});
test('sort files by precedence descending', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/overrides/Button.js`];
  const result = [
    `${escapedCwd}/overrides/Button.js`,
    `${escapedCwd}/common/Card.js`,
    `${escapedCwd}/common/Button.js`
  ];
  const useOptions = { ...options, sort: 'pattern-desc', debug: true } satisfies GlobInput;
  assert.deepEqual([...sortFilesByPatternPrecedence(files, patterns, useOptions)], result);
  assert.deepEqual(sortFiles(files, patterns, useOptions), result);
});
