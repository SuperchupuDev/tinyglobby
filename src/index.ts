import path, { posix } from 'node:path';
import { type Options as FdirOptions, fdir } from 'fdir';
import picomatch from 'picomatch';
import { escapePath, isDynamicPattern, log } from './utils.ts';

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
    const current = result.split('/');
    properties.commonPath ??= current;

    const newCommonPath: string[] = [];
    const length = Math.min(properties.commonPath.length, current.length);

    for (let i = 0; i < length; i++) {
      const part = current[i];

      if (part === '**' && !current[i + 1]) {
        newCommonPath.pop();
        break;
      }

      if (part !== properties.commonPath[i] || isDynamicPattern(part) || i === current.length - 1) {
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
    // don't handle negated patterns here for consistency with fast-glob
    if (pattern[0] !== '!' || pattern[1] === '(') {
      ignorePatterns.push(normalizePattern(pattern, expandDirectories, cwd, properties, true));
    }
  }

  const transformed: string[] = [];
  for (const pattern of patterns) {
    if (pattern[0] !== '!' || pattern[1] === '(') {
      const newPattern = normalizePattern(pattern, expandDirectories, cwd, properties, false);
      matchPatterns.push(newPattern);
      const split = newPattern.split('/');
      let splitSize = split.length;
      if (split[splitSize - 1] === '**') {
        if (split[splitSize - 2] !== '..') {
          split[splitSize - 2] = '**';
          split.pop();
          splitSize--;
        }
        transformed.push(splitSize ? split.join('/') : '*');
      } else {
        transformed.push(splitSize > 1 ? split.slice(0, -1).join('/') : split.join('/'));
      }

      for (let i = splitSize - 2; i > 0; i--) {
        const part = split.slice(0, i);
        if (part[part.length - 1] === '**') {
          part.pop();
          if (part.length > 1) {
            part.pop();
          }
        }
        transformed.push(part.join('/'));
      }
    } else if (pattern[1] !== '!' || pattern[2] === '(') {
      ignorePatterns.push(normalizePattern(pattern.slice(1), expandDirectories, cwd, properties, true));
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns, transformed };
}

// TODO: this is slow, find a better way to do this
function getRelativePath(path: string, cwd: string, root: string) {
  return posix.relative(cwd, `${root}/${path}`);
}

function processPath(path: string, cwd: string, root: string, isDirectory: boolean, absolute?: boolean) {
  const relativePath = absolute ? path.slice(root.length + 1) || '.' : path;

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
  if (Array.isArray(options.patterns) && options.patterns.length === 0) {
    return sync ? [] : Promise.resolve([]);
  }

  const properties = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };

  const processed = processPatterns(options, cwd, properties);
  const nocase = options.caseSensitiveMatch === false;

  const matcher = picomatch(processed.match, {
    dot: options.dot,
    nocase,
    ignore: processed.ignore
  });

  const ignore = picomatch(processed.ignore, {
    dot: options.dot,
    nocase
  });

  const exclude = picomatch('*(../)**', {
    dot: true,
    nocase,
    ignore: processed.transformed
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
              log(`matched ${path}`);
            }

            return matches;
          }
        : (p, isDirectory) => matcher(processPath(p, cwd, properties.root, isDirectory, options.absolute))
    ],
    exclude: options.debug
      ? (_, p) => {
          const relativePath = processPath(p, cwd, properties.root, true, true);
          const skipped = ignore(relativePath) || exclude(relativePath);

          if (!skipped) {
            log(`crawling ${p}`);
          }

          return skipped;
        }
      : (_, p) => {
          const relativePath = processPath(p, cwd, properties.root, true, true);
          return ignore(relativePath) || exclude(relativePath);
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
  const root = properties.root;
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
