import { type FSLike } from 'fdir'

export type FileSystemAdapter = Partial<FSLike>;

export interface GlobOptions {
  /**
   * Whether to return absolute paths. Disable to have relative paths.
   * @default false
   */
  absolute?: boolean;
<<<<<<< HEAD
  /**
   * Enables support for brace expansion syntax, like `{a,b}` or `{1..9}`.
   * @default true
   */
  braceExpansion?: boolean;
  /**
   * Whether to match in case-sensitive mode.
   * @default true
   */
=======
  cwd: string;
  patterns: string | string[];
  ignore?: string | string[];
  dot?: boolean;
  deep?: number;
  followSymbolicLinks?: boolean;
>>>>>>> 7b92ffa (perf: overhaul tinyglobby options building)
  caseSensitiveMatch?: boolean;
  /**
   * The working directory in which to search. Results will be returned relative to this directory, unless
   * {@link absolute} is set.
   *
   * It is important to avoid globbing outside this directory when possible, even with absolute paths enabled,
   * as doing so can harm performance due to having to recalculate relative paths.
   * @default process.cwd()
   */
  cwd?: string | URL;
  /**
   * Logs useful debug information. Meant for development purposes. Logs can change at any time.
   * @default false
   */
  debug?: boolean;
  /**
   * Maximum directory depth to crawl.
   * @default Infinity
   */
  deep?: number;
  /**
   * Whether to return entries that start with a dot, like `.gitignore` or `.prettierrc`.
   * @default false
   */
  dot?: boolean;
  /**
   * Whether to automatically expand directory patterns.
   *
   * Important to disable if migrating from [`fast-glob`](https://github.com/mrmlnc/fast-glob).
   * @default true
   */
  expandDirectories?: boolean;
  /**
   * Enables support for extglobs, like `+(pattern)`.
   * @default true
   */
  extglob?: boolean;
  /**
   * Whether to traverse and include symbolic links. Can slightly affect performance.
   * @default true
   */
  followSymbolicLinks?: boolean;
  /**
   * An object that overrides `node:fs` functions.
   * @default import('node:fs')
   */
  fs?: FileSystemAdapter;
  /**
   * Enables support for matching nested directories with globstars (`**`).
   * If `false`, `**` behaves exactly like `*`.
   * @default true
   */
  globstar?: boolean;
  /**
   * Glob patterns to exclude from the results.
   * @default []
   */
  ignore?: string | readonly string[];
  /**
   * Enable to only return directories.
   * If `true`, disables {@link onlyFiles}.
   * @default false
   */
  onlyDirectories?: boolean;
  /**
   * Enable to only return files.
   * @default true
   */
  onlyFiles?: boolean;
  /**
   * @deprecated Provide patterns as the first argument instead.
   */
  patterns?: string | readonly string[];
  /**
   * An `AbortSignal` to abort crawling the file system.
   * @default undefined
   */
  signal?: AbortSignal;
}

export interface InternalProps {
  root: string;
  commonPath: string[] | null;
  depthOffset: number;
}

export interface ProcessedPatterns {
  match: string[];
  ignore: string[];
}

// temporary workaround for https://github.com/rolldown/tsdown/issues/391
export interface PartialMatcherOptions {
  dot?: boolean;
  nobrace?: boolean;
  nocase?: boolean;
  noextglob?: boolean;
  noglobstar?: boolean;
  posix?: boolean;
}

export type Input = string | string[] | Partial<GlobOptions>;
