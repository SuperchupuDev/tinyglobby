import nativeFs from 'node:fs';
import path, { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Crawler,
  FileSystemAdapter,
  GlobInput,
  GlobOptions,
  InternalOptions,
  InternalProps,
  ProcessedPatterns,
  RelativeMapper
} from './types.ts';
import {
  BACKSLASHES,
  ensureStringArray,
  escapePath,
  isDynamicPattern,
  isReadonlyArray,
  log,
  splitPattern
} from './utils.ts';
import { buildCrawler } from './crawler.ts';

const PARENT_DIRECTORY = /^(\/?\.\.)+/;
const ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g;

function normalizePattern(pattern: string, opts: InternalOptions, props: InternalProps, isIgnore: boolean) {
  const cwd = opts.cwd as string;
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

function processPatterns(options: InternalOptions, patterns: readonly string[], props: InternalProps): ProcessedPatterns {
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];

  for (const pattern of options.ignore) {
    if (!pattern) {
      continue;
    }
    // don't handle negated patterns here for consistency with fast-glob
    if (pattern[0] !== '!' || pattern[1] === '(') {
      ignorePatterns.push(normalizePattern(pattern, options, props, true));
    }
  }

  for (const pattern of patterns) {
    if (!pattern) {
      continue;
    }
    if (pattern[0] !== '!' || pattern[1] === '(') {
      matchPatterns.push(normalizePattern(pattern, options, props, false));
    } else if (pattern[1] !== '!' || pattern[2] === '(') {
      ignorePatterns.push(normalizePattern(pattern.slice(1), options, props, true));
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

function formatPaths(paths: string[], mapper?: false | RelativeMapper) {
  if (mapper) {
    for (let i = paths.length - 1; i >= 0; i--) {
      paths[i] = mapper(paths[i]);
    }
  }
  return paths;
}

const fsKeys = ['readdir', 'readdirSync', 'realpath', 'realpathSync', 'stat', 'statSync'];

function normalizeFs(fs?: Record<string, unknown>): FileSystemAdapter | undefined {
  if (fs && fs !== nativeFs) {
    for (const key of fsKeys) {
      fs[key] = (fs[key] ? fs : (nativeFs as Record<string, unknown>))[key];
    }
  }
  return fs;
}

// Object containing all default options to ensure there is no hidden state difference
// between false and undefined.
const defaultOptions: GlobOptions = {
  caseSensitiveMatch: true,
  cwd: process.cwd(),
  debug: !!process.env.TINYGLOBBY_DEBUG,
  expandDirectories: true,
  followSymbolicLinks: true,
  onlyFiles: true
};

function getOptions(options?: GlobOptions): InternalOptions {
  const opts = { ...defaultOptions, ...options } as InternalOptions;

  opts.cwd = (opts.cwd instanceof URL ? fileURLToPath(opts.cwd) : path.resolve(opts.cwd)).replace(BACKSLASHES, '/');
  // Default value of [] will be inserted here if ignore is undefined
  opts.ignore = ensureStringArray(opts.ignore);
  opts.fs = normalizeFs(opts.fs);

  if (opts.debug) {
    log('globbing with options:', opts);
  }

  return opts;
}

function getCrawler(globInput: GlobInput, inputOptions: GlobOptions = {}): [] | [Crawler, false | RelativeMapper] {
  if (globInput && inputOptions?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const isModern = isReadonlyArray(globInput) || typeof globInput === 'string';
  // defaulting to ['**/*'] is tinyglobby exclusive behavior, deprecated
  const patterns = ensureStringArray((isModern ? globInput : globInput.patterns) ?? ['**/*']);
  const options = getOptions(isModern ? inputOptions : globInput);
  const cwd = options.cwd as string;

  if (Array.isArray(patterns) && patterns.length === 0) {
    return [];
  }

  const props: InternalProps = { root: cwd, depthOffset: 0 };
  return buildCrawler(props, options, processPatterns(options, patterns, props), cwd);
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
export async function glob(globInput: GlobInput, options?: GlobOptions): Promise<string[]> {
  const [crawler, relative] = getCrawler(globInput, options);
  return crawler ? formatPaths(await crawler.withPromise(), relative) : [];
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
export function globSync(globInput: GlobInput, options?: GlobOptions): string[] {
  const [crawler, relative] = getCrawler(globInput, options);
  return crawler ? formatPaths(crawler.sync(), relative) : [];
}

export type { GlobOptions } from './types.ts';
export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
