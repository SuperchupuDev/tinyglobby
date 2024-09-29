import picomatch from 'picomatch';

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

export const escapePath: (path: string) => string = process.platform === 'win32' ? escapeWin32Path : escapePosixPath;
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
