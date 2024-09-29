// #region escapePath

/*
  Matches the following unescaped symbols:
  `(){}[]`, `!+@` before `(`, `!` at the beginning,
  plus the following platform-specific symbols:

  Posix: `*?|`, `\` before non-special characters.
*/
const POSIX_UNESCAPED_GLOB_SYMBOLS = /(?<!\\)([()[\]{}*?|]|^!|[!+@](?=\()|\\(?![()[\]{}!*+?@|]))/g;
const WIN32_UNESCAPED_GLOB_SYMBOLS = /(?<!\\)([()[\]{}]|^!|[!+@](?=\())/g;

export const escapePosixPath = (pattern: string): string => pattern.replace(POSIX_UNESCAPED_GLOB_SYMBOLS, '\\$&');
export const escapeWin32Path = (pattern: string): string => pattern.replace(WIN32_UNESCAPED_GLOB_SYMBOLS, '\\$&');

export const escapePath: (pattern: string) => string = process.platform === 'win32' ? escapeWin32Path : escapePosixPath;

//#endregion
