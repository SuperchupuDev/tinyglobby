import path, { posix } from 'node:path';
import { type Options as FdirOptions, fdir } from 'fdir';
import picomatch from 'picomatch';
import { escapePath, getPartialMatcher, isDynamicPattern, splitPattern } from './utils.ts';

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

interface InternalProperties {
  root: string;
  commonPath: string[] | null;
  depthOffset: number;
}

function normalizePattern(
  pattern: string,
  expandDirectories: boolean,
  cwd: string,
  properties: InternalProperties,
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

  if (path.isAbsolute(result.replace(/\\(?=[()[\]{}!*+?@|])/g, ''))) {
    result = posix.relative(escapePath(cwd), result);
  } else {
    result = posix.normalize(result);
  }

  const parentDirectoryMatch = /^(\/?\.\.)+/.exec(result);
  if (parentDirectoryMatch?.[0]) {
    const potentialRoot = posix.join(cwd, parentDirectoryMatch[0]);
    if (properties.root.length > potentialRoot.length) {
      properties.root = potentialRoot;
      properties.depthOffset = -(parentDirectoryMatch[0].length + 1) / 3;
    }
  } else if (!isIgnore && properties.depthOffset >= 0) {
    const parts = splitPattern(result);
    properties.commonPath ??= parts;

    const newCommonPath = [];
    const length = Math.min(properties.commonPath.length, parts.length)

    for (let i = 0; i < length; i++) {
      const part = parts[i];

      if (part === '**' && !parts[i + 1]) {
        newCommonPath.pop();
        break;
      }

      if (part !== properties.commonPath[i] || isDynamicPattern(part) || i === parts.length - 1) {
        break;
      }

      newCommonPath.push(part);
    }

    properties.depthOffset = newCommonPath.length;
    properties.commonPath = newCommonPath;

    properties.root = newCommonPath.length > 0 ? `${cwd}/${newCommonPath.join('/')}` : cwd;
  }

  return result;
}

function processPatterns(
  { patterns, ignore = [], expandDirectories = true }: GlobOptions,
  cwd: string,
  properties: InternalProperties
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
    if (!pattern.startsWith('!') || pattern[1] === '(') {
      const newPattern = normalizePattern(pattern, expandDirectories, cwd, properties, true);
      ignorePatterns.push(newPattern);
    }
  }

  for (const pattern of patterns) {
    if (!pattern) {
      continue;
    }
    if (!pattern.startsWith('!') || pattern[1] === '(') {
      const newPattern = normalizePattern(pattern, expandDirectories, cwd, properties, false);
      matchPatterns.push(newPattern);
    } else if (pattern[1] !== '!' || pattern[2] === '(') {
      const newPattern = normalizePattern(pattern.slice(1), expandDirectories, cwd, properties, true);
      ignorePatterns.push(newPattern);
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

// TODO: this is slow, find a better way to do this
function getRelativePath(path: string, cwd: string, root: string) {
  return posix.relative(cwd, `${root}/${path}`) || '.';
}

function processPath(path: string, cwd: string, root: string, isDirectory: boolean, absolute?: boolean) {
  const relativePath = absolute ? path.slice(root.length + 1) || '.' : path;

  if (root === cwd) {
    return isDirectory && relativePath !== '.' ? relativePath.slice(0, -1) : relativePath;
  }

  return getRelativePath(relativePath, cwd, root);
}

function crawl(options: GlobOptions, cwd: string, sync: false): Promise<string[]>;
function crawl(options: GlobOptions, cwd: string, sync: true): string[];
function crawl(options: GlobOptions, cwd: string, sync: boolean) {
  if (Array.isArray(options.patterns) && options.patterns.length === 0) {
    return sync ? [] : Promise.resolve([]);
  }

  const properties = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };

  const processed = processPatterns(options, cwd, properties);

  const matcher = picomatch(processed.match, {
    dot: options.dot,
    nocase: options.caseSensitiveMatch === false,
    ignore: processed.ignore
  });

  const ignore = picomatch(processed.ignore, {
    dot: options.dot,
    nocase: options.caseSensitiveMatch === false
  });

  const partialMatcher = getPartialMatcher(processed.match, {
    dot: options.dot,
    nocase: options.caseSensitiveMatch === false
  });

  if (process.env.TINYGLOBBY_DEBUG) {
    options.debug = true;
  }

  const fdirOptions: Partial<FdirOptions> = {
    // use relative paths in the matcher
    filters: [
      options.debug
        ? (p, isDirectory) => {
            const path = processPath(p, cwd, properties.root, isDirectory, options.absolute);
            const matches = matcher(path);

            if (matches) {
              console.log(`[tinyglobby ${new Date().toLocaleTimeString('es')}] matched ${path}`);
            }

            return matches;
          }
        : (p, isDirectory) => matcher(processPath(p, cwd, properties.root, isDirectory, options.absolute))
    ],
    exclude: options.debug
      ? (_, p) => {
          const relativePath = processPath(p, cwd, properties.root, true, true);
          const skipped = (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);

          if (!skipped) {
            console.log(`[tinyglobby ${new Date().toLocaleTimeString('es')}] crawling ${p}`);
          }

          return skipped;
        }
      : (_, p) => {
          const relativePath = processPath(p, cwd, properties.root, true, true);
          return (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
        },
    pathSeparator: '/',
    relativePaths: true,
    resolveSymlinks: true
  };

  if (options.deep) {
    fdirOptions.maxDepth = Math.round(options.deep - properties.depthOffset);
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

  // backslashes are removed so that inferred roots like `C:/New folder \\(1\\)` work
  properties.root = properties.root.replace(/\\/g, '');
  const api = new fdir(fdirOptions).crawl(properties.root);

  if (cwd === properties.root || options.absolute) {
    return sync ? api.sync() : api.withPromise();
  }

  return sync
    ? api.sync().map(p => getRelativePath(p, cwd, properties.root) + (!p || p.endsWith('/') ? '/' : ''))
    : api
        .withPromise()
        .then(paths => paths.map(p => getRelativePath(p, cwd, properties.root) + (!p || p.endsWith('/') ? '/' : '')));
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
  const cwd = opts.cwd ? path.resolve(opts.cwd).replace(/\\/g, '/') : process.cwd().replace(/\\/g, '/');

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
  const cwd = opts.cwd ? path.resolve(opts.cwd).replace(/\\/g, '/') : process.cwd().replace(/\\/g, '/');

  return crawl(opts, cwd, true);
}

export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
