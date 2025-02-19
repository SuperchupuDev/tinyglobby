import nativeFs from 'node:fs';
import path, { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Options as FdirOptions, type FSLike, fdir } from 'fdir';
import picomatch, { type PicomatchOptions } from 'picomatch';
import {
  buildFormat,
  buildRelative,
  escapePath,
  getPartialMatcher,
  isDynamicPattern,
  isReadonlyArray,
  log,
  splitPattern
} from './utils.ts';

const PARENT_DIRECTORY = /^(\/?\.\.)+/;
const ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g;
const BACKSLASHES = /\\/g;

export interface GlobOptions {
  /**
   * Whether to return absolute paths. Disable to have relative paths.
   * @default false
   */
  absolute?: boolean;
  /**
   * Enables support for brace expansion syntax, like `{a,b}` or `{1..9}`.
   * @default true
   */
  braceExpansion?: boolean;
  /**
   * Whether to match in case-sensitive mode.
   * @default true
   */
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

export type FileSystemAdapter = Partial<FSLike>;

interface InternalProps {
  root: string;
  commonPath: string[] | null;
  depthOffset: number;
}

function normalizePattern(
  pattern: string,
  expandDirectories: boolean,
  cwd: string,
  props: InternalProps,
  isIgnore: boolean
) {
  let result: string = pattern;
  if (pattern.endsWith('/')) {
    result = pattern.slice(0, -1);
  }
  // using a directory as entry should match all files inside it
  if (!result.endsWith('*') && opts.expandDirectories) {
    result += '/**';
  }

  const escapedCwd = escapePath(cwd);
  if (path.isAbsolute(result.replace(ESCAPING_BACKSLASHES, ''))) {
    result = posix.relative(escapedCwd, result);
  } else {
    result = posix.normalize(result);
  }

  const parentDirectoryMatch = PARENT_DIRECTORY.exec(result);
  const parts = splitPattern(result);
  if (parentDirectoryMatch?.[0]) {
    const n = (parentDirectoryMatch[0].length + 1) / 3;

    // normalize a pattern like `../foo/bar` to `bar` when cwd ends with `/foo`
    let i = 0;
    const cwdParts = escapedCwd.split('/');
    while (i < n && parts[i + n] === cwdParts[cwdParts.length + i - n]) {
      result = result.slice(0, (n - i - 1) * 3) + result.slice((n - i) * 3 + parts[i + n].length + 1) || '.';
      i++;
    }

    // move root `n` directories up
    const potentialRoot = posix.join(cwd, parentDirectoryMatch[0].slice(i * 3));
    // windows can make the potential root something like `../C:`, we don't want that
    if (!potentialRoot.startsWith('.') && props.root.length > potentialRoot.length) {
      props.root = potentialRoot;
      props.depthOffset = -n + i;
    }
  }

  if (!isIgnore && props.depthOffset >= 0) {
    props.commonPath ??= parts;

    const newCommonPath: string[] = [];
    const length = Math.min(props.commonPath.length, parts.length);

    for (let i = 0; i < length; i++) {
      const part = parts[i];

      if (part === '**' && !parts[i + 1]) {
        newCommonPath.pop();
        break;
      }

      if (part !== props.commonPath[i] || isDynamicPattern(part) || i === parts.length - 1) {
        break;
      }

      newCommonPath.push(part);
    }

    props.depthOffset = newCommonPath.length;
    props.commonPath = newCommonPath;

    props.root = newCommonPath.length > 0 ? posix.join(cwd, ...newCommonPath) : cwd;
  }

  return result;
}

function processPatterns(
  // defaulting to ['**/*'] is tinyglobby exclusive behavior, deprecated
  { patterns = ['**/*'], ignore = [], expandDirectories = true }: GlobOptions,
  cwd: string,
  props: InternalProps
): ProcessedPatterns {
  if (typeof patterns === 'string') {
    patterns = [patterns];
  }

  if (typeof ignore === 'string') {
    ignore = [ignore];
  }

  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];

  for (const pattern of opts.ignore) {
    if (!pattern) {
      continue;
    }
    // don't handle negated patterns here for consistency with fast-glob
    if (pattern[0] !== '!' || pattern[1] === '(') {
      ignorePatterns.push(normalizePattern(pattern, props, opts, true));
    }
  }

  for (const pattern of opts.patterns) {
    if (!pattern) {
      continue;
    }
    if (pattern[0] !== '!' || pattern[1] === '(') {
      matchPatterns.push(normalizePattern(pattern, props, opts, false));
    } else if (pattern[1] !== '!' || pattern[2] === '(') {
      ignorePatterns.push(normalizePattern(pattern.slice(1), props, opts, true));
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

function validateInput(input: Input, options?: Partial<GlobOptions>) {
  if (input && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option.')
  }
}

function formatPaths(paths: string[], relative: (p: string) => string) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    paths[i] = relative(path);
  }
  return paths;
}

function normalizeCwd(cwd?: string | URL) {
  if (!cwd) {
    return process.cwd().replace(BACKSLASHES, '/');
  }

  if (cwd instanceof URL) {
    return fileURLToPath(cwd).replace(BACKSLASHES, '/');
  }

  return path.resolve(cwd).replace(BACKSLASHES, '/');
}

function getCrawler(patterns?: string | readonly string[], inputOptions: Omit<GlobOptions, 'patterns'> = {}) {
  const options = process.env.TINYGLOBBY_DEBUG ? { ...inputOptions, debug: true } : inputOptions;
  const cwd = normalizeCwd(options.cwd);

  if (options.debug) {
    log('globbing with:', { patterns, options, cwd });
  }

  if (Array.isArray(patterns) && patterns.length === 0) {
    return [
      {
        sync: () => [],
        withPromise: async () => []
      },
      false
    ] as const;
  }

  const props: InternalProps = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };

  const processed = processPatterns({ ...options, patterns }, cwd, props);

  if (options.debug) {
    log('internal processing patterns:', processed);
  }

  const matchOptions = {
    dot: options.dot,
    nobrace: options.braceExpansion === false,
    nocase: options.caseSensitiveMatch === false,
    noextglob: options.extglob === false,
    noglobstar: options.globstar === false,
    posix: true
  } satisfies PicomatchOptions;

  const matcher = picomatch(processed.match, { ...matchOptions, ignore: processed.ignore });
  const ignore = picomatch(processed.ignore, matchOptions);
  const partialMatcher = getPartialMatcher(processed.match, matchOptions);

  const format = buildFormat(cwd, props.root, options.absolute);
  const formatExclude = options.absolute ? format : buildFormat(cwd, props.root, true);
  const fdirOptions: Partial<FdirOptions> = {
    // use relative paths in the matcher
    filters: [
      options.debug
        ? (p, isDirectory) => {
            const path = format(p, isDirectory);
            const matches = matcher(path);

            if (matches) {
              log(`matched ${path}`);
            }

            return matches;
          }
        : (p, isDirectory) => matcher(format(p, isDirectory))
    ],
    exclude: options.debug
      ? (_, p) => {
          const relativePath = formatExclude(p, true);
          const skipped = (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);

          if (skipped) {
            log(`skipped ${p}`);
          } else {
            log(`crawling ${p}`);
          }

          return skipped;
        }
      : (_, p) => {
          const relativePath = formatExclude(p, true);
          return (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
        },
    fs: options.fs
      ? {
          readdir: options.fs.readdir || nativeFs.readdir,
          readdirSync: options.fs.readdirSync || nativeFs.readdirSync,
          realpath: options.fs.realpath || nativeFs.realpath,
          realpathSync: options.fs.realpathSync || nativeFs.realpathSync,
          stat: options.fs.stat || nativeFs.stat,
          statSync: options.fs.statSync || nativeFs.statSync
        }
      : undefined,
    pathSeparator: '/',
    relativePaths: true,
    resolveSymlinks: true,
    signal: options.signal
  };

  if (options.deep !== undefined) {
    fdirOptions.maxDepth = Math.round(options.deep - props.depthOffset);
  }

  if (options.absolute) {
    fdirOptions.relativePaths = false;
    fdirOptions.resolvePaths = true;
    fdirOptions.includeBasePath = true;
  }

  if (options.followSymbolicLinks === false) {
    fdirOptions.resolveSymlinks = false;
    fdirOptions.excludeSymlinks = true;
  }

  if (options.onlyDirectories) {
    fdirOptions.excludeFiles = true;
    fdirOptions.includeDirs = true;
  } else if (options.onlyFiles === false) {
    fdirOptions.includeDirs = true;
  }

  props.root = props.root.replace(BACKSLASHES, '');
  const root = props.root;

  if (opts.debug) {
    log('internal processing patterns:', processed);
    log('internal properties:', props);
  }

  const relative = cwd !== root && !options.absolute && buildRelative(cwd, props.root);
  return [new fdir(fdirOptions).crawl(root), relative] as const;
}

/**
 * Asynchronously match files following a glob pattern.
 * @see {@link https://superchupu.dev/tinyglobby/documentation#glob}
 */
export function glob(patterns: string | readonly string[], options?: Omit<GlobOptions, 'patterns'>): Promise<string[]>;
/**
 * @deprecated Provide patterns as the first argument instead.
 */
export function glob(options: GlobOptions): Promise<string[]>;
export async function glob(
  patternsOrOptions: string | readonly string[] | GlobOptions,
  options?: GlobOptions
): Promise<string[]> {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const isModern = isReadonlyArray(patternsOrOptions) || typeof patternsOrOptions === 'string';
  const opts = isModern ? options : patternsOrOptions;
  const patterns = isModern ? patternsOrOptions : patternsOrOptions.patterns;

  const [crawler, relative] = getCrawler(patterns, opts);

  if (!relative) {
    return crawler.withPromise();
  }
  return formatPaths(await crawler.withPromise(), relative);
}

/**
 * Synchronously match files following a glob pattern.
 * @see {@link https://superchupu.dev/tinyglobby/documentation#globSync}
 */
export function globSync(patterns: string | readonly string[], options?: Omit<GlobOptions, 'patterns'>): string[];
/**
 * @deprecated Provide patterns as the first argument instead.
 */
export function globSync(options: GlobOptions): string[];
export function globSync(patternsOrOptions: string | readonly string[] | GlobOptions, options?: GlobOptions): string[] {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const isModern = isReadonlyArray(patternsOrOptions) || typeof patternsOrOptions === 'string';
  const opts = isModern ? options : patternsOrOptions;
  const patterns = isModern ? patternsOrOptions : patternsOrOptions.patterns;

  const [crawler, relative] = getCrawler(patterns, opts);

  if (!relative) {
    return crawler.sync();
  }
  return formatPaths(crawler.sync(), relative);
}

export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
