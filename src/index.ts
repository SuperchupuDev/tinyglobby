import path from 'node:path';
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

function normalizePattern(pattern: string, expandDirectories: boolean) {
  let result: string = pattern;
  if (pattern.endsWith('/') || pattern.endsWith('\\')) {
    result = pattern.slice(0, -1);
  }
  // using a directory as entry should match all files inside it
  if (!pattern.endsWith('*') && expandDirectories) {
    result += '/**';
  }
  return result;
}

function processPatterns({ patterns, ignore = [], expandDirectories = true }: GlobOptions) {
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = ignore.map(p => normalizePattern(p, expandDirectories));

  if (!patterns) {
    return { match: ['**/*'], ignore: ignorePatterns };
  }

  for (let pattern of patterns) {
    pattern = normalizePattern(pattern, expandDirectories);
    if (pattern.startsWith('!') && pattern[1] !== '(') {
      ignorePatterns.push(pattern.slice(1));
    } else {
      matchPatterns.push(pattern);
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

function processPath(path: string, cwd: string, absolute?: boolean) {
  const pathWithoutTrailingSlash = path.endsWith('/') ? path.slice(0, -1) : path;

  return absolute ? pathWithoutTrailingSlash.slice(cwd.length + 1) : pathWithoutTrailingSlash;
}

function getFdirBuilder(options: GlobOptions, cwd: string) {
  const processed = processPatterns(options);

  const matcher = picomatch(processed.match, {
    dot: options.dot,
    ignore: processed.ignore
  });

  const exclude = picomatch(processed.ignore, {
    dot: options.dot
  });

  const fdirOptions: Partial<FdirOptions> = {
    // use relative paths in the matcher
    filters: [p => matcher(processPath(p, cwd, options.absolute))],
    exclude: (_, p) => exclude(p.slice(cwd.length + 1).slice(0, -1)),
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

  return new fdir(fdirOptions);
}

export function glob(patterns: string[], options?: Omit<GlobOptions, 'patterns'>): Promise<string[]>;
export function glob(options: GlobOptions): Promise<string[]>;
export async function glob(patternsOrOptions: string[] | GlobOptions, options?: GlobOptions): Promise<string[]> {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const opts = Array.isArray(patternsOrOptions) ? { ...options, patterns: patternsOrOptions } : patternsOrOptions;
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();

  return getFdirBuilder(opts, cwd).crawl(cwd).withPromise();
}

export function globSync(patterns: string[], options?: Omit<GlobOptions, 'patterns'>): string[];
export function globSync(options: GlobOptions): string[];
export function globSync(patternsOrOptions: string[] | GlobOptions, options?: GlobOptions): string[] {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const opts = Array.isArray(patternsOrOptions) ? { ...options, patterns: patternsOrOptions } : patternsOrOptions;
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();

  return getFdirBuilder(opts, cwd).crawl(cwd).sync();
}
