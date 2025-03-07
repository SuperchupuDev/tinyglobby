import path, { posix } from 'node:path';
import { type Options as FdirOptions, fdir } from 'fdir';
import picomatch from 'picomatch';
import { escapePath, getPartialMatcher, isDynamicPattern, log, splitPattern } from './utils.ts';

const PARENT_DIRECTORY = /^(\/?\.\.)+/;
const ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g;
const BACKSLASHES = /\\/g;

export interface GlobOptions {
  absolute?: boolean;
  cwd?: string;
  patterns?: string | string[];
  ignore?: string | string[];
  dot?: boolean;
  deep?: number;
  followSymbolicLinks?: boolean;
  caseSensitiveMatch?: boolean;
  expandDirectories?: boolean;
  onlyDirectories?: boolean;
  onlyFiles?: boolean;
  debug?: boolean;
}

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
  if (!result.endsWith('*') && expandDirectories) {
    result += '/**';
  }

  if (path.isAbsolute(result.replace(ESCAPING_BACKSLASHES, ''))) {
    result = posix.relative(escapePath(cwd), result);
  } else {
    result = posix.normalize(result);
  }

  const parentDirectoryMatch = PARENT_DIRECTORY.exec(result);
  if (parentDirectoryMatch?.[0]) {
    const potentialRoot = posix.join(cwd, parentDirectoryMatch[0]);
    if (props.root.length > potentialRoot.length) {
      props.root = potentialRoot;
      props.depthOffset = -(parentDirectoryMatch[0].length + 1) / 3;
    }
  } else if (!isIgnore && props.depthOffset >= 0) {
    const parts = splitPattern(result);
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

    props.root = newCommonPath.length > 0 ? path.posix.join(cwd, ...newCommonPath) : cwd;
  }

  return result;
}

function processPatterns(
  { patterns, ignore = [], expandDirectories = true }: GlobOptions,
  cwd: string,
  props: InternalProps
) {
  if (typeof patterns === 'string') {
    patterns = [patterns];
  } else if (!patterns) {
    // tinyglobby exclusive behavior, should be considered deprecated
    patterns = ['**/*'];
  }

  if (typeof ignore === 'string') {
    ignore = [ignore];
  }

  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];

  for (const pattern of ignore) {
    if (!pattern) {
      continue;
    }
    // don't handle negated patterns here for consistency with fast-glob
    if (pattern[0] !== '!' || pattern[1] === '(') {
      ignorePatterns.push(normalizePattern(pattern, expandDirectories, cwd, props, true));
    }
  }

  for (const pattern of patterns) {
    if (!pattern) {
      continue;
    }
    if (pattern[0] !== '!' || pattern[1] === '(') {
      matchPatterns.push(normalizePattern(pattern, expandDirectories, cwd, props, false));
    } else if (pattern[1] !== '!' || pattern[2] === '(') {
      ignorePatterns.push(normalizePattern(pattern.slice(1), expandDirectories, cwd, props, true));
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

// TODO: this is slow, find a better way to do this
function getRelativePath(path: string, cwd: string, root: string) {
  return posix.relative(cwd, `${root}/${path}`) || '.';
}

function processPath(path: string, cwd: string, root: string, isDirectory: boolean, absolute?: boolean) {
  const relativePath = absolute ? path.slice(root === '/' ? 1 : root.length + 1) || '.' : path;

  if (root === cwd) {
    return isDirectory && relativePath !== '.' ? relativePath.slice(0, -1) : relativePath;
  }

  return getRelativePath(relativePath, cwd, root);
}

function formatPaths(paths: string[], cwd: string, root: string) {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    paths[i] = getRelativePath(path, cwd, root) + (!path || path.endsWith('/') ? '/' : '');
  }
  return paths;
}

function crawl(options: GlobOptions, cwd: string, sync: false): Promise<string[]>;
function crawl(options: GlobOptions, cwd: string, sync: true): string[];
function crawl(options: GlobOptions, cwd: string, sync: boolean) {
  if (process.env.TINYGLOBBY_DEBUG) {
    options.debug = true;
  }

  if (options.debug) {
    log('globbing with options:', options, 'cwd:', cwd);
  }

  if (Array.isArray(options.patterns) && options.patterns.length === 0) {
    return sync ? [] : Promise.resolve([]);
  }

  const props = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };

  const processed = processPatterns(options, cwd, props);
  const nocase = options.caseSensitiveMatch === false;

  if (options.debug) {
    log('internal processing patterns:', processed);
  }

  const matcher = picomatch(processed.match, {
    dot: options.dot,
    nocase,
    ignore: processed.ignore
  });

  const ignore = picomatch(processed.ignore, {
    dot: options.dot,
    nocase
  });

  const partialMatcher = getPartialMatcher(processed.match, {
    dot: options.dot,
    nocase
  });

  const fdirOptions: Partial<FdirOptions> = {
    // use relative paths in the matcher
    filters: [
      options.debug
        ? (p, isDirectory) => {
            const path = processPath(p, cwd, props.root, isDirectory, options.absolute);
            const matches = matcher(path);

            if (matches) {
              log(`matched ${path}`);
            }

            return matches;
          }
        : (p, isDirectory) => matcher(processPath(p, cwd, props.root, isDirectory, options.absolute))
    ],
    exclude: options.debug
      ? (_, p) => {
          const relativePath = processPath(p, cwd, props.root, true, true);
          const skipped = (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);

          if (skipped) {
            log(`skipped ${p}`);
          } else {
            log(`crawling ${p}`);
          }

          return skipped;
        }
      : (_, p) => {
          const relativePath = processPath(p, cwd, props.root, true, true);
          return (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
        },
    pathSeparator: '/',
    relativePaths: true,
    resolveSymlinks: true
  };

  if (options.deep) {
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

  const api = new fdir(fdirOptions).crawl(root);

  if (cwd === root || options.absolute) {
    return sync ? api.sync() : api.withPromise();
  }

  return sync ? formatPaths(api.sync(), cwd, root) : api.withPromise().then(paths => formatPaths(paths, cwd, root));
}

export function glob(patterns: string | string[], options?: Omit<GlobOptions, 'patterns'>): Promise<string[]>;
export function glob(options: GlobOptions): Promise<string[]>;
export async function glob(
  patternsOrOptions: string | string[] | GlobOptions,
  options?: GlobOptions
): Promise<string[]> {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const opts =
    Array.isArray(patternsOrOptions) || typeof patternsOrOptions === 'string'
      ? { ...options, patterns: patternsOrOptions }
      : patternsOrOptions;
  const cwd = opts.cwd ? path.resolve(opts.cwd).replace(BACKSLASHES, '/') : process.cwd().replace(BACKSLASHES, '/');

  return crawl(opts, cwd, false);
}

export function globSync(patterns: string | string[], options?: Omit<GlobOptions, 'patterns'>): string[];
export function globSync(options: GlobOptions): string[];
export function globSync(patternsOrOptions: string | string[] | GlobOptions, options?: GlobOptions): string[] {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const opts =
    Array.isArray(patternsOrOptions) || typeof patternsOrOptions === 'string'
      ? { ...options, patterns: patternsOrOptions }
      : patternsOrOptions;
  const cwd = opts.cwd ? path.resolve(opts.cwd).replace(BACKSLASHES, '/') : process.cwd().replace(BACKSLASHES, '/');

  return crawl(opts, cwd, true);
}

export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
