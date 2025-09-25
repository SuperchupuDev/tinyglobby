import nativeFs from 'node:fs';
import path, { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FSLike } from 'fdir';
import { buildFDir } from './fdir.ts';
import type { GlobCrawler, GlobOptions, InternalProps } from './types.ts';
import {
  BACKSLASHES,
  ensureStringArray,
  escapePath,
  isDynamicPattern,
  isFunction,
  isReadonlyArray,
  log,
  splitPattern
} from './utils.ts';

const PARENT_DIRECTORY = /^(\/?\.\.)+/;
const ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g;

function normalizePattern(pattern: string, props: InternalProps, opts: GlobOptions, isIgnore: boolean): string {
  const cwd: string = opts.cwd as string;
  let result: string = pattern;
  if (pattern[pattern.length - 1] === '/') {
    result = pattern.slice(0, -1);
  }
  // using a directory as entry should match all files inside it
  if (result[result.length - 1] !== '*' && opts.expandDirectories) {
    result += '/**';
  }

  const escapedCwd = escapePath(cwd);
  result = path.isAbsolute(result.replace(ESCAPING_BACKSLASHES, ''))
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
      result = `${result.slice(0, (n - i - 1) * 3)}${result.slice((n - i) * 3 + parts[i + n].length + 1)}` || '.';
      i++;
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

function processPatterns(opts: GlobOptions, patterns: readonly string[], props: InternalProps) {
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];

  for (const pattern of opts.ignore as string[]) {
    // don't handle negated patterns here for consistency with fast-glob
    if ((pattern && pattern[0] !== '!') || pattern[1] === '(') {
      ignorePatterns.push(normalizePattern(pattern, props, opts, true));
    }
  }

  for (const pattern of patterns) {
    if (pattern) {
      if (pattern[0] !== '!' || pattern[1] === '(') {
        matchPatterns.push(normalizePattern(pattern, props, opts, false));
      } else if (pattern[1] !== '!' || pattern[2] === '(') {
        ignorePatterns.push(normalizePattern(pattern.slice(1), props, opts, true));
      }
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

function formatPaths(paths: string[], relative: (p: string) => string): string[] {
  for (let i = paths.length - 1; i >= 0; i--) {
    paths[i] = relative(paths[i]);
  }
  return paths;
}

function normalizeCwd(cwd: string | URL) {
  return (cwd instanceof URL ? fileURLToPath(cwd) : path.resolve(cwd)).replace(BACKSLASHES, '/');
}

const fsKeys = ['readdir', 'readdirSync', 'realpath', 'realpathSync', 'stat', 'statSync'];

function normalizeFs(fs: Record<string, unknown>): Partial<FSLike> {
  if (fs !== nativeFs) {
    for (const key of fsKeys) {
      fs[key] = (isFunction(fs[key]) ? fs : (nativeFs as Record<string, unknown>))[key];
    }
  }
  return fs as Partial<FSLike>;
}

// Some of these options have to be set in this way to mitigate state differences between boolean and undefined
const defaultOptions: Partial<GlobOptions> = {
  absolute: false,
  expandDirectories: true,
  debug: !!process.env.TINYGLOBBY_DEBUG,
  cwd: process.cwd(),
  ignore: [],
  // tinyglobby exclusive behavior, should be considered deprecated
  caseSensitiveMatch: true,
  followSymbolicLinks: true,
  onlyFiles: true,
  dot: false,
  fs: nativeFs
};

function getOptions(options?: Partial<GlobOptions>): GlobOptions {
  const opts = {
    ...defaultOptions,
    ...options,
    debug: !!(process.env.TINYGLOBBY_DEBUG ?? options?.debug)
  };

  opts.cwd = normalizeCwd(opts.cwd as string);
  opts.ignore = ensureStringArray(opts.ignore);
  opts.fs = normalizeFs(opts.fs as Partial<FSLike>);

  if (opts.debug) {
    log('globbing with:', { options, cwd: opts.cwd });
  }

  return opts as GlobOptions;
}

function crawl(patternsOrOptions: string | readonly string[] | GlobOptions = ['**/*'], inputOptions: GlobOptions = {}) {
  if (patternsOrOptions && inputOptions?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const isModern = isReadonlyArray(patternsOrOptions) || typeof patternsOrOptions === 'string';
  const patterns = ensureStringArray((isModern ? patternsOrOptions : patternsOrOptions.patterns) ?? ['**/*']);
  const options = getOptions(isModern ? inputOptions : patternsOrOptions);
  const cwd = options.cwd as string;

  if (Array.isArray(patterns) && patterns.length === 0) {
    return;
  }

  const props: InternalProps = { root: cwd, depthOffset: 0 };
  const processed = processPatterns(options, patterns, props);

  if (options.debug) {
    log('internal processing patterns:', processed);
  }

  return buildFDir(props, options, processed, cwd);
}

function evalGlobResult(paths?: string[], crawler?: GlobCrawler): string[] {
  if (!crawler || !paths?.length) {
    return [];
  }
  return crawler.relative ? formatPaths(paths, crawler.relative) : paths;
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
  const globCrawler = crawl(patternsOrOptions, options);
  return evalGlobResult(await globCrawler?.crawler.withPromise(), globCrawler);
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
  const globCrawler = crawl(patternsOrOptions, options);
  return evalGlobResult(globCrawler?.crawler.sync(), globCrawler);
}

export type { GlobOptions } from './types.ts';
export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
