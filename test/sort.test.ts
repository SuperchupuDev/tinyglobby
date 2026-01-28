import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createFixture } from 'fs-fixture';
import { buildCrawlerInfo } from '../src/crawler.ts';
import { getOptions } from '../src/options.ts';
import {
  compileMatchers,
  internalSortFiles,
  internalSortFilesByPatternPrecedence,
  sortFiles,
  sortFilesByPatternPrecedence
} from '../src/sort.ts';
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

test('compileMatchers yields matchers', () => {
  const generator = compileMatchers(patterns, options);
  let count = 0;

  for (const [glob, match] of generator) {
    count++;
    assert.equal(typeof glob, 'string');
    assert.equal(typeof match, 'function');
  }
  assert.equal(count, 2);
});

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

// internal tests
test('sort files with custom function', () => {
  const files = [`${escapedCwd}/overrides/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/common/Button.js`];
  const useOptions = { ...options, sort: (a, b) => a.localeCompare(b) } satisfies GlobInput;
  assert.deepEqual(sortFiles(files, patterns, useOptions), [
    `${escapedCwd}/common/Button.js`,
    `${escapedCwd}/common/Card.js`,
    `${escapedCwd}/overrides/Button.js`
  ]);
});

test('sort files with no options', () => {
  const files = [`${escapedCwd}/overrides/Button.js`, `${escapedCwd}/common/Card.js`, `${escapedCwd}/common/Button.js`];
  // sort without options
  assert.deepEqual(sortFiles(files, patterns), [
    `${escapedCwd}/overrides/Button.js`,
    `${escapedCwd}/common/Card.js`,
    `${escapedCwd}/common/Button.js`
  ]);
});

test('sort files by precedence with no options', () => {
  // we need to change the cwd to the fixture path to make sure the patterns match
  // since we are not passing options to sortFilesByPatternPrecedence
  const originalCwd = process.cwd();
  try {
    process.chdir(cwd);
    const files = ['common/Button.js', 'common/Card.js', 'overrides/Button.js'];
    // sort without options
    assert.deepEqual(
      [...sortFilesByPatternPrecedence(files, patterns)],
      ['overrides/Button.js', 'common/Button.js', 'common/Card.js']
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test('sort files with single pattern', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`];
  const singlePattern = ['common/**/*.js'];

  // pattern (no sort)
  assert.deepEqual(sortFiles(files, singlePattern, { ...options, sort: 'pattern' }), files);

  // pattern-asc (sort asc)
  assert.deepEqual(sortFiles(files, singlePattern, { ...options, sort: 'pattern-asc' }), [
    `${escapedCwd}/common/Button.js`,
    `${escapedCwd}/common/Card.js`
  ]);

  // pattern-desc (sort desc)
  assert.deepEqual(sortFiles(files, singlePattern, { ...options, sort: 'pattern-desc' }), [
    `${escapedCwd}/common/Card.js`,
    `${escapedCwd}/common/Button.js`
  ]);
});

test('sort files by precedence with single pattern', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`];
  const singlePattern = ['common/**/*.js'];

  // pattern (no sort)
  assert.deepEqual([...sortFilesByPatternPrecedence(files, singlePattern, { ...options, sort: 'pattern' })], files);

  // pattern-asc (sort asc)
  assert.deepEqual(
    [...sortFilesByPatternPrecedence(files, singlePattern, { ...options, sort: 'pattern-asc' })],
    [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`]
  );

  // pattern-desc (sort desc)
  assert.deepEqual(
    [...sortFilesByPatternPrecedence(files, singlePattern, { ...options, sort: 'pattern-desc' })],
    [`${escapedCwd}/common/Card.js`, `${escapedCwd}/common/Button.js`]
  );
});

test('sort files by precedence with single pattern and custom sort', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`];
  const singlePattern = ['common/**/*.js'];
  const useOptions = { ...options, sort: (a, b) => a.localeCompare(b) } satisfies GlobInput;

  assert.deepEqual(
    [...sortFilesByPatternPrecedence(files, singlePattern, useOptions)],
    [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`]
  );
});

test('sort files with invalid sort option', () => {
  const files = [`${escapedCwd}/override/Button.js`, `${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`];
  assert.deepEqual(
    internalSortFiles(
      files,
      buildCrawlerInfo(getOptions(options), patterns),
      // @ts-expect-error force add coverage for L165
      'invalid'
    ),
    files
  );
});
test('sort files with single pattern and pattern sort option', () => {
  const files = [`${escapedCwd}/common/Button.js`, `${escapedCwd}/common/Card.js`];
  assert.deepEqual(
    [...internalSortFilesByPatternPrecedence(files, buildCrawlerInfo(getOptions(options), [patterns[1]]), 'pattern')],
    files
  );
});
