import nativeFs from 'node:fs';
import path, { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Options as FdirOptions, fdir } from 'fdir';
import picomatch, { type PicomatchOptions } from 'picomatch';
import type { GlobCrawler, GlobOptions, InternalProps } from './types.ts';
import {
  buildFormat,
  buildRelative,
  ensureStringArray,
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
  if (path.isAbsolute(result.replace(ESCAPING_BACKSLASHES, ''))) {
    result = posix.relative(escapedCwd, result);
  } else {
    result = posix.normalize(result);
  }

  const parentDir = PARENT_DIRECTORY.exec(result)?.[0];
  const parts = splitPattern(result);
  if (parentDir) {
    const n = (parentDir.length + 1) / 3;

    // normalize a pattern like `../foo/bar` to `bar` when cwd ends with `/foo`
    let i = 0;
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

function processPatterns(opts: GlobOptions, patterns: readonly string[], props: InternalProps) {
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];

  for (const pattern of opts.ignore as string[]) {
    if (!pattern) {
      continue;
    }
    // don't handle negated patterns here for consistency with fast-glob
    if (pattern[0] !== '!' || pattern[1] === '(') {
      ignorePatterns.push(normalizePattern(pattern, props, opts, true));
    }
  }

  for (const pattern of patterns) {
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

function formatPaths(paths: string[], relative: (p: string) => string) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    paths[i] = relative(path);
  }
  return paths;
}

function normalizeCwd(cwd: string | URL) {
  return (cwd instanceof URL ? fileURLToPath(cwd) : path.resolve(cwd)).replace(BACKSLASHES, '/');
}

const defaultOptions: Partial<GlobOptions> = {
  expandDirectories: true,
  debug: !!process.env.TINYGLOBBY_DEBUG,
  cwd: process.cwd(),
  ignore: [],
  // tinyglobby exclusive behavior, should be considered deprecated
  caseSensitiveMatch: true,
  followSymbolicLinks: true,
  onlyFiles: true,
  dot: false
};

function getOptions(options?: Partial<GlobOptions>): GlobOptions {
  const opts = {
    ...defaultOptions,
    ...options,
    debug: !!(process.env.TINYGLOBBY_DEBUG ?? options?.debug)
  };

  opts.cwd = normalizeCwd(opts.cwd as string);
  opts.ignore = ensureStringArray(opts.ignore);

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

  const props = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };

  const processed = processPatterns(options, patterns, props);

  if (options.debug) {
    log('internal processing patterns:', processed);
  }

  // Undefined and false are two different options here!
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

  if (options.debug) {
    log('internal properties:', props);
  }

  const relative = cwd !== root && !options.absolute && buildRelative(cwd, props.root);
  return { crawler: new fdir(fdirOptions).crawl(root), relative };
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
