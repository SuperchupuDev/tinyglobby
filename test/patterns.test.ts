import assert from 'node:assert/strict';
import { test } from 'node:test';
import processPatterns from '../src/patterns.ts';
import type { InternalOptions, InternalProps } from '../src/types.ts';

for (const [cwd, parent] of [
  ['//server/share/project', '//server/share/'],
  ['/project', '/'],
  ['Z:/project', 'Z:/']
]) {
  for (const { patterns, root, depthOffset } of [
    { patterns: ['specs/**/*.md'], root: `${cwd}/specs`, depthOffset: 1 },
    { patterns: ['specs/a.md', 'specs/b.md'], root: `${cwd}/specs`, depthOffset: 1 },
    { patterns: ['specs/a.md', 'other/b.md'], root: cwd, depthOffset: 0 },
    { patterns: ['specs/\\[draft\\]/*.md'], root: `${cwd}/specs/\\[draft\\]`, depthOffset: 2 },
    { patterns: ['**'], root: cwd, depthOffset: 0 },
    { patterns: ['../other/*.md'], root: parent, depthOffset: -1 },
    { patterns: ['../project/specs/*.md'], root: `${cwd}/specs`, depthOffset: 3 }
  ]) {
    test(`crawl root for ${patterns.join(', ')} from ${cwd}`, () => {
      const options: InternalOptions = {
        cwd,
        ignore: [],
        caseSensitiveMatch: true,
        debug: false,
        expandDirectories: false,
        followSymbolicLinks: true,
        onlyFiles: true
      };
      const props: InternalProps = { root: cwd, depthOffset: 0 };

      processPatterns(options, patterns, props);

      assert.equal(props.root, root);
      assert.equal(props.depthOffset, depthOffset);
    });
  }
}

test('static prefixes keep the POSIX root absolute', () => {
  const options: InternalOptions = {
    cwd: '/',
    ignore: [],
    caseSensitiveMatch: true,
    debug: false,
    expandDirectories: false,
    followSymbolicLinks: true,
    onlyFiles: true
  };
  const props: InternalProps = { root: '/', depthOffset: 0 };

  processPatterns(options, ['specs/*.md'], props);

  assert.equal(props.root, '/specs');
});

test('parent patterns cannot remove the UNC server or share', () => {
  const cwd = '//server/share/project';
  const options: InternalOptions = {
    cwd,
    ignore: [],
    caseSensitiveMatch: true,
    debug: false,
    expandDirectories: false,
    followSymbolicLinks: true,
    onlyFiles: true
  };
  const props: InternalProps = { root: cwd, depthOffset: 0 };

  const patterns = processPatterns(options, ['../../../*.md'], props);

  assert.equal(props.root, '//server/share/');
  assert.deepEqual(patterns.match, ['../../../*.md']);
  assert.equal(props.depthOffset, -3);
});
