import path, { posix } from 'node:path';
import { type Options as FdirOptions, fdir } from 'fdir';
import picomatch from 'picomatch';

export interface GlobOptions {
  absolute?: boolean;
  cwd?: string;
  patterns?: string[];
  ignore?: string[];
  dot?: boolean;
  deep?: number;
  expandDirectories?: boolean;
  onlyDirectories?: boolean;
  onlyFiles?: boolean;
}

let root: string;

function normalizePattern(pattern: string, expandDirectories: boolean, cwd: string) {
  let result: string = pattern;
  if (pattern.endsWith('/')) {
    result = pattern.slice(0, -1);
  }
  // using a directory as entry should match all files inside it
  if (!result.endsWith('*') && expandDirectories) {
    result += '/**';
  }

  if (result.startsWith(cwd)) {
    return posix.relative(cwd, result);
  }

  if (result.startsWith('./')) {
    result = result.slice(2);
  }

  const parentDirectoryMatch = /^(\/?\.\.)+/.exec(result);
  if (parentDirectoryMatch?.[0]) {
    const potentialRoot = posix.join(cwd, parentDirectoryMatch[0]);
    if (root.length > potentialRoot.length) {
      root = potentialRoot;
    }
  }

  return result;
}

function processPatterns({ patterns, ignore = [], expandDirectories = true }: GlobOptions, cwd: string) {
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = ignore.map(p => normalizePattern(p, expandDirectories, cwd));

  if (!patterns) {
    return { match: ['**/*'], ignore: ignorePatterns };
  }

  for (let pattern of patterns) {
    pattern = normalizePattern(pattern, expandDirectories, cwd);
    if (pattern.startsWith('!') && pattern[1] !== '(') {
      ignorePatterns.push(pattern.slice(1));
    } else {
      matchPatterns.push(pattern);
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

// TODO: this is slow, find a better way to do this
function getRelativePath(path: string, cwd: string) {
  return posix.relative(cwd, `${root}/${path}`);
}

function processPath(path: string, cwd: string, isDirectory: boolean, absolute?: boolean) {
  const relativePath = absolute ? path.slice(root.length + 1) : path;
  if (root === cwd) {
    return isDirectory ? relativePath.slice(0, -1) : relativePath;
  }

  return getRelativePath(relativePath, cwd);
}

function crawl(options: GlobOptions, cwd: string, sync: false): Promise<string[]>;
function crawl(options: GlobOptions, cwd: string, sync: true): string[];
function crawl(options: GlobOptions, cwd: string, sync: boolean) {
  root = cwd;
  const processed = processPatterns(options, cwd);

  const matcher = picomatch(processed.match, {
    dot: options.dot,
    ignore: processed.ignore
  });

  const exclude = picomatch(processed.ignore, {
    dot: options.dot
  });

  const fdirOptions: Partial<FdirOptions> = {
    // use relative paths in the matcher
    filters: [(p, isDirectory) => matcher(processPath(p, cwd, isDirectory, options.absolute))],
    exclude: (_, p) => exclude(processPath(p, cwd, true, true)),
    pathSeparator: '/',
    relativePaths: true
  };

  if (options.deep) {
    fdirOptions.maxDepth = options.deep;
  }

  if (options.absolute) {
    fdirOptions.relativePaths = false;
    fdirOptions.resolvePaths = true;
    fdirOptions.includeBasePath = true;
  }

  if (options.onlyDirectories) {
    fdirOptions.excludeFiles = true;
    fdirOptions.includeDirs = true;
  } else if (options.onlyFiles === false) {
    fdirOptions.includeDirs = true;
  }

  const api = new fdir(fdirOptions).crawl(root);

  if (cwd === root || options.absolute) {
    return sync ? api.sync() : api.withPromise();
  }

  return sync
    ? api.sync().map(p => getRelativePath(p, cwd))
    : api.withPromise().then(paths => paths.map(p => getRelativePath(p, cwd)));
}

export function glob(patterns: string[], options?: Omit<GlobOptions, 'patterns'>): Promise<string[]>;
export function glob(options: GlobOptions): Promise<string[]>;
export async function glob(patternsOrOptions: string[] | GlobOptions, options?: GlobOptions): Promise<string[]> {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const opts = Array.isArray(patternsOrOptions) ? { ...options, patterns: patternsOrOptions } : patternsOrOptions;
  const cwd = opts.cwd ? path.resolve(opts.cwd).replace(/\\/g, '/') : process.cwd().replace(/\\/g, '/');

  return crawl(opts, cwd, false);
}

export function globSync(patterns: string[], options?: Omit<GlobOptions, 'patterns'>): string[];
export function globSync(options: GlobOptions): string[];
export function globSync(patternsOrOptions: string[] | GlobOptions, options?: GlobOptions): string[] {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const opts = Array.isArray(patternsOrOptions) ? { ...options, patterns: patternsOrOptions } : patternsOrOptions;
  const cwd = opts.cwd ? path.resolve(opts.cwd).replace(/\\/g, '/') : process.cwd().replace(/\\/g, '/');

  return crawl(opts, cwd, true);
}
