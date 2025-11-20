import { isAbsolute, posix } from 'node:path';
import type { InternalOptions, InternalProps, ProcessedPatterns } from './types.ts';
import { escapePath, isDynamicPattern, splitPattern } from './utils.ts';

const PARENT_DIRECTORY = /^(\/?\.\.)+/;
const ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g;

function normalizePattern(pattern: string, opts: InternalOptions, props: InternalProps, isIgnore: boolean) {
  const cwd = opts.cwd as string;
  let result: string = pattern;

  if (pattern[pattern.length - 1] === '/') {
    result = pattern.slice(0, -1);
  }
  // using a directory as entry should match all files inside it
  if (result[result.length - 1] !== '*' && opts.expandDirectories) {
    result += '/**';
  }

  const escapedCwd = escapePath(cwd);
  result = isAbsolute(result.replace(ESCAPING_BACKSLASHES, ''))
    ? posix.relative(escapedCwd, result)
    : posix.normalize(result);

  const parentDir = PARENT_DIRECTORY.exec(result)?.[0];
  const parts = splitPattern(result);
  let i = 0;

  if (parentDir) {
    const n = (parentDir.length + 1) / 3;

    // normalize a pattern like `../foo/bar` to `bar` when cwd ends with `/foo`
    const cwdParts = escapedCwd.split('/');
    while (i < n && parts[i + n] === cwdParts[cwdParts.length + i - n]) {
      result = `${result.slice(0, (n - i - 1) * 3)}${result.slice((n - i) * 3 + parts[i++ + n].length + 1) || '.'}`;
    }

    // move root `n` directories up
    const potentialRoot = posix.join(cwd, parentDir.slice(i * 3));
    // windows can make the potential root something like `../C:`, we don't want that
    if (potentialRoot[0] !== '.' && props.root.length > potentialRoot.length) {
      props.root = potentialRoot;
      props.depthOffset = -n + i;
    }
  }

  if (!isIgnore && props.depthOffset >= 0) {
    props.commonPath ??= parts;

    const newCommonPath: string[] = [];
    const length = Math.min(props.commonPath.length, parts.length);

    for (i = 0; i < length; i++) {
      const part = parts[i];

      if (part === '**' && !parts[i + 1]) {
        newCommonPath.pop();
        break;
      }

      if (i === parts.length - 1 || part !== props.commonPath[i] || isDynamicPattern(part)) {
        break;
      }
    }

    props.depthOffset = newCommonPath.length;
    props.commonPath = newCommonPath;

    props.root = newCommonPath.length > 0 ? posix.join(cwd, ...newCommonPath) : cwd;
  }

  return result;
}

export default function processPatterns(
  options: InternalOptions,
  patterns: readonly string[],
  props: InternalProps
): ProcessedPatterns {
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];

  for (const pattern of options.ignore) {
    // don't handle negated patterns here for consistency with fast-glob
    if (pattern && (pattern[0] !== '!' || pattern[1] === '(')) {
      ignorePatterns.push(normalizePattern(pattern, options, props, true));
    }
  }

  for (const pattern of patterns) {
    if (pattern) {
      if (pattern[0] !== '!' || pattern[1] === '(') {
        matchPatterns.push(normalizePattern(pattern, options, props, false));
      } else if (pattern[1] !== '!' || pattern[2] === '(') {
        ignorePatterns.push(normalizePattern(pattern.slice(1), options, props, true));
      }
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}
