import picomatch, { type Matcher } from 'picomatch';

// #region PARTIAL MATCHER
export interface PartialMatcherOptions {
  dot?: boolean;
  nocase?: boolean;
}

// the result of over 4 months of figuring stuff out and a LOT of help
export function getPartialMatcher(patterns: string[], options?: PartialMatcherOptions): Matcher {
  const regexes = patterns.map(pattern => splitPattern(pattern).map(part => picomatch.makeRe(part, options)));
  return (input: string) => {
    // no need to `splitPattern` as this is indeed not a pattern
    const inputParts = input.split('/');
    for (let i = 0; i < patterns.length; i++) {
      const patternParts = splitPattern(patterns[i]);
      const regex = regexes[i];
      const minParts = Math.min(inputParts.length, patternParts.length);
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
        if (part === '**' && match) {
          return true;
        }

        j++;
      }
      if (j === inputParts.length) {
        return true;
      }
    }

    return false;
  };
}
// #endregion

// #region splitPattern
// if a pattern has no slashes outside glob symbols, results.parts is []
export function splitPattern(path: string): string[] {
  const result = picomatch.scan(path, { parts: true });
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
/**
 *  Logs the current task.
 *
 *  @param task - the current task.
 */
export function log(task: string): void {
  console.log(`[tinyglobby ${new Date().toLocaleTimeString('es')}] ${task}`);
}
// #endregion
