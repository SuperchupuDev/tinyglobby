import path, { posix } from 'node:path';
import { type Options as FdirOptions, fdir } from 'fdir';
import picomatch from 'picomatch';
import { isDynamicPattern } from './utils.ts';

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
    result = posix.relative(cwd, result);
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

    const newCommonPath = [];

    for (let i = 0; i < Math.min(properties.commonPath.length, current.length); i++) {
      const part = current[i];

      if (part === '**') {
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
  }

  if (typeof ignore === 'string') {
    ignore = [ignore];
  }

  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = ignore.map(p => normalizePattern(p, expandDirectories, cwd, properties, true));

  if (!patterns) {
    return { match: ['**/*'], ignore: ignorePatterns };
  }

  for (let pattern of patterns) {
    pattern = normalizePattern(pattern, expandDirectories, cwd, properties, false);
    if (pattern.startsWith('!') && pattern[1] !== '(') {
      ignorePatterns.push(pattern.slice(1));
    } else {
      matchPatterns.push(pattern);
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

// TODO: this is slow, find a better way to do this
function getRelativePath(path: string, cwd: string, root: string) {
  return posix.relative(cwd, `${root}/${path}`);
}

function processPath(path: string, cwd: string, root: string, isDirectory: boolean, absolute?: boolean) {
  const relativePath = absolute ? path.slice(root.length + 1) : path;

  if (root === cwd) {
    return isDirectory ? relativePath.slice(0, -1) : relativePath;
  }

  return getRelativePath(relativePath, cwd, root);
}

function crawl(options: GlobOptions, cwd: string, sync: false): Promise<string[]>;
function crawl(options: GlobOptions, cwd: string, sync: true): string[];
function crawl(options: GlobOptions, cwd: string, sync: boolean) {
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

  const exclude = picomatch(processed.ignore, {
    dot: options.dot,
    nocase: options.caseSensitiveMatch === false
  });

  const fdirOptions: Partial<FdirOptions> = {
    // use relative paths in the matcher
    filters: [(p, isDirectory) => matcher(processPath(p, cwd, properties.root, isDirectory, options.absolute))],
    exclude: (_, p) => exclude(processPath(p, cwd, properties.root, true, true)),
    excludeSymlinks: true,
    pathSeparator: '/',
    relativePaths: true
  };

  if (options.deep) {
    fdirOptions.maxDepth = Math.round(options.deep - properties.depthOffset);
  }

  if (options.absolute) {
    fdirOptions.relativePaths = false;
    fdirOptions.resolvePaths = true;
    fdirOptions.includeBasePath = true;
  }

  if (options.followSymbolicLinks !== false) {
    fdirOptions.resolveSymlinks = true;
    fdirOptions.excludeSymlinks = false;
  }

  if (options.onlyDirectories) {
    fdirOptions.excludeFiles = true;
    fdirOptions.includeDirs = true;
  } else if (options.onlyFiles === false) {
    fdirOptions.includeDirs = true;
  }

  // backslashes are removed so that inferred roots like `C:/New folder \\(1\\)` work
  const api = new fdir(fdirOptions).crawl(properties.root.replace(/\\/g, ''));

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

export { escapePath, isDynamicPattern } from './utils.ts';
