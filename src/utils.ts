import { posix } from 'node:path';
import picomatch from 'picomatch';

// #region PARTIAL MATCHER
export interface PartialMatcherOptions {
  dot?: boolean;
  nocase?: boolean;
}

// can't use `Matcher` from picomatch as it requires a second argument since @types/picomatch v4
type PartialMatcher = (test: string) => boolean;

const ONLY_PARENT_DIRECTORIES = /^(\/?\.\.)+$/;

// the result of over 4 months of figuring stuff out and a LOT of help
export function getPartialMatcher(patterns: string[], options?: PartialMatcherOptions): PartialMatcher {
  // you might find this code pattern odd, but apparently it's faster than using `.push()`
  const patternsCount = patterns.length;
  const patternsParts: string[][] = Array(patternsCount);
  const regexes: RegExp[][] = Array(patternsCount);
  for (let i = 0; i < patternsCount; i++) {
    const parts = splitPattern(patterns[i]);
    patternsParts[i] = parts;
    const partsCount = parts.length;
    const partRegexes = Array(partsCount);
    for (let j = 0; j < partsCount; j++) {
      partRegexes[j] = picomatch.makeRe(parts[j], options);
    }
    regexes[i] = partRegexes;
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
      const regex = regexes[i];
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

        const match = regex[j].test(inputParts[j]);

        if (!match) {
          break;
        }

        // unlike popular belief, `**` doesn't return true in *all* cases
        // some examples are when matching it to `.a` with dot: false or `..`
        // so it needs to match to return early
        if (part === '**') {
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
// `path.relative` is slow, we want to avoid it as much as we can
// like `buildRelative`, but with some differences to avoid extra work
// for example we definitely do not want trailing slashes
export function buildFormat(cwd: string, root: string, absolute?: boolean): (p: string, isDir: boolean) => string {
  if (cwd === root || root.startsWith(`${cwd}/`)) {
    if (absolute) {
      const start = cwd === '/' ? 1 : cwd.length + 1;
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

const isWin = process.platform === 'win32';

// #region convertPathToPattern
const ESCAPED_WIN32_BACKSLASHES = /\\(?![()[\]{}!+@])/g;
export function convertPosixPathToPattern(path: string): string {
  return escapePosixPath(path);
}

export function convertWin32PathToPattern(path: string): string {
  return escapeWin32Path(path).replace(ESCAPED_WIN32_BACKSLASHES, '/');
}

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

export const escapePath: (path: string) => string = isWin ? escapeWin32Path : escapePosixPath;
// #endregion

// #region isDynamicPattern
/*
  Has a few minor differences with `fast-glob` for better accuracy:

  Doesn't necessarily return false on patterns that include `\\`.

  Returns true if the pattern includes parentheses,
  regardless of them representing one single pattern or not.

  Returns true for unfinished glob extensions i.e. `(h`, `+(h`.

  Returns true for unfinished brace expansions as long as they include `,` or `..`.
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
