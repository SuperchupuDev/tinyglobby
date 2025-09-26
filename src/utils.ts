import { posix } from 'node:path';
import picomatch, { type Matcher } from 'picomatch';
import type { PartialMatcher, PartialMatcherOptions } from './types.ts';

// The `Array.isArray` type guard doesn't work for readonly arrays.
export const isReadonlyArray: (arg: unknown) => arg is readonly unknown[] = Array.isArray;

const isWin = process.platform === 'win32';

// #region PARTIAL MATCHER
const ONLY_PARENT_DIRECTORIES = /^(\/?\.\.)+$/;

// the result of over 4 months of figuring stuff out and a LOT of help
export function getPartialMatcher(patterns: string[], options: PartialMatcherOptions = {}): PartialMatcher {
  // you might find this code pattern odd, but apparently it's faster than using `.push()`
  const patternsCount = patterns.length;
  const patternsParts: string[][] = Array(patternsCount);
  const matchers: Matcher[][] = Array(patternsCount);
  const globstarEnabled = !options.noglobstar;
  for (let i = 0; i < patternsCount; i++) {
    const parts = splitPattern(patterns[i]);
    patternsParts[i] = parts;
    const partsCount = parts.length;
    const partMatchers: Matcher[] = Array(partsCount);
    for (let j = 0; j < partsCount; j++) {
      partMatchers[j] = picomatch(parts[j], options);
    }
    matchers[i] = partMatchers;
  }
  return (input: string) => {
    // no need to `splitPattern` as this is indeed not a pattern
    const inputParts = input.split('/');
    // if we only have patterns like `src/*` but the input is `../..`
    // normally the parent directory would not get crawled
    // and as such wrong results would be returned
    // to avoid this always return true if the input only consists of .. ../.. etc
    if (inputParts[0] === '..' && ONLY_PARENT_DIRECTORIES.test(input)) {
      return true;
    }
    for (let i = 0; i < patterns.length; i++) {
      const patternParts = patternsParts[i];
      const matcher = matchers[i];
      const inputPatternCount = inputParts.length;
      const minParts = Math.min(inputPatternCount, patternParts.length);
      let j = 0;
      while (j < minParts) {
        const part = patternParts[j];

        // handling slashes in parts is very hard, not even fast-glob does it
        // unlike fast-glob we should return true in this case
        // for us, better to have a false positive than a false negative here
        if (part.includes('/')) {
          return true;
        }

        const match = matcher[j](inputParts[j]);

        if (!match) {
          break;
        }

        // unlike popular belief, `**` doesn't return true in *all* cases
        // some examples are when matching it to `.a` with dot: false or `..`
        // so it needs to match to return early
        if (globstarEnabled && part === '**') {
          return true;
        }

        j++;
      }
      if (j === inputPatternCount) {
        return true;
      }
    }

    return false;
  };
}
// #endregion

// #region format & relative
/* node:coverage ignore next 2 */
const WIN32_ROOT_DIR = /^[A-Z]:\/$/i;
const isRoot = isWin ? (p: string) => WIN32_ROOT_DIR.test(p) : (p: string) => p === '/';

// `path.relative` is slow, we want to avoid it as much as we can
// like `buildRelative`, but with some differences to avoid extra work
// for example we definitely do not want trailing slashes
export function buildFormat(cwd: string, root: string, absolute?: boolean): (p: string, isDir: boolean) => string {
  if (cwd === root || root.startsWith(`${cwd}/`)) {
    if (absolute) {
      const start = isRoot(cwd) ? cwd.length : cwd.length + 1;
      return (p: string, isDir: boolean) => p.slice(start, isDir ? -1 : undefined) || '.';
    }
    const prefix = root.slice(cwd.length + 1);
    if (prefix) {
      return (p: string, isDir: boolean) => {
        if (p === '.') {
          return prefix;
        }
        const result = `${prefix}/${p}`;
        return isDir ? result.slice(0, -1) : result;
      };
    }
    return (p: string, isDir: boolean) => (isDir && p !== '.' ? p.slice(0, -1) : p);
  }

  if (absolute) {
    return (p: string) => posix.relative(cwd, p) || '.';
  }
  return (p: string) => posix.relative(cwd, `${root}/${p}`) || '.';
}

// like format but we need to do less
export function buildRelative(cwd: string, root: string): (p: string) => string {
  if (root.startsWith(`${cwd}/`)) {
    const prefix = root.slice(cwd.length + 1);
    return p => `${prefix}/${p}`;
  }

  return p => {
    const result = posix.relative(cwd, `${root}/${p}`);
    if (p.endsWith('/') && result !== '') {
      return `${result}/`;
    }
    return result || '.';
  };
}
// #endregion

// #region splitPattern
// make options a global constant to reduce GC work
const splitPatternOptions = { parts: true };

// if a pattern has no slashes outside glob symbols, results.parts is []
export function splitPattern(path: string): string[] {
  const result = picomatch.scan(path, splitPatternOptions);
  return result.parts?.length ? result.parts : [path];
}
// #endregion

// #region convertPathToPattern
const ESCAPED_WIN32_BACKSLASHES = /\\(?![()[\]{}!+@])/g;
export function convertPosixPathToPattern(path: string): string {
  return escapePosixPath(path);
}

export function convertWin32PathToPattern(path: string): string {
  return escapeWin32Path(path).replace(ESCAPED_WIN32_BACKSLASHES, '/');
}

/**
 * Converts a path to a pattern depending on the platform.
 * Identical to {@link escapePath} on POSIX systems.
 * @see {@link https://superchupu.dev/tinyglobby/documentation#convertPathToPattern}
 */
/* node:coverage ignore next 3 */
export const convertPathToPattern: (path: string) => string = isWin
  ? convertWin32PathToPattern
  : convertPosixPathToPattern;
// #endregion

// #region escapePath
/*
  Matches the following unescaped symbols:
  `(){}[]`, `!+@` before `(`, `!` at the beginning,
  plus the following platform-specific symbols:

  Posix: `*?|`, `\\` before non-special characters.
*/
const POSIX_UNESCAPED_GLOB_SYMBOLS = /(?<!\\)([()[\]{}*?|]|^!|[!+@](?=\()|\\(?![()[\]{}!*+?@|]))/g;
const WIN32_UNESCAPED_GLOB_SYMBOLS = /(?<!\\)([()[\]{}]|^!|[!+@](?=\())/g;

export const escapePosixPath = (path: string): string => path.replace(POSIX_UNESCAPED_GLOB_SYMBOLS, '\\$&');
export const escapeWin32Path = (path: string): string => path.replace(WIN32_UNESCAPED_GLOB_SYMBOLS, '\\$&');

/**
 * Escapes a path's special characters depending on the platform.
 * @see {@link https://superchupu.dev/tinyglobby/documentation#escapePath}
 */
/* node:coverage ignore next */
export const escapePath: (path: string) => string = isWin ? escapeWin32Path : escapePosixPath;
// #endregion

// #region isDynamicPattern
/**
 * Checks if a pattern has dynamic parts.
 *
 * Has a few minor differences with [`fast-glob`](https://github.com/mrmlnc/fast-glob) for better accuracy:
 *
 * - Doesn't necessarily return `false` on patterns that include `\`.
 * - Returns `true` if the pattern includes parentheses, regardless of them representing one single pattern or not.
 * - Returns `true` for unfinished glob extensions i.e. `(h`, `+(h`.
 * - Returns `true` for unfinished brace expansions as long as they include `,` or `..`.
 *
 * @see {@link https://superchupu.dev/tinyglobby/documentation#isDynamicPattern}
 */
export function isDynamicPattern(pattern: string, options?: { caseSensitiveMatch: boolean }): boolean {
  if (options?.caseSensitiveMatch === false) {
    return true;
  }

  const scan = picomatch.scan(pattern);
  return scan.isGlob || scan.negated;
}
// #endregion

// #region log
export function log(...tasks: unknown[]): void {
  console.log(`[tinyglobby ${new Date().toLocaleTimeString('es')}]`, ...tasks);
}
// #endregion
