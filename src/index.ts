import path from 'node:path';
import { type Options as FdirOptions, fdir } from 'fdir';
import picomatch from 'picomatch';

export interface GlobOptions {
  absolute?: boolean;
  cwd?: string;
  patterns?: string[];
  ignore?: string[];
  dot?: boolean;
  expandDirectories?: boolean;
  onlyDirectories?: boolean;
}

// using a directory as entry should match all files inside it
function expandDir(pattern: string) {
  if (pattern.endsWith('/')) {
    return `${pattern}**`;
  }
  if (pattern.endsWith('\\')) {
    return `${pattern.slice(0, -1)}/**`;
  }
  return `${pattern}/**`;
}

function processPatterns({ patterns, ignore = [], expandDirectories = true }: GlobOptions) {
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = ignore.map(p => (!p.endsWith('*') && expandDirectories ? expandDir(p) : p));

  if (!patterns || patterns.length === 0) {
    return { match: ['**/*'], ignore: ignorePatterns };
  }

  for (let pattern of patterns) {
    // using a directory as entry should match all files inside it
    if (!pattern.endsWith('*') && expandDirectories) {
      pattern = expandDir(pattern);
    }
    if (pattern.startsWith('!') && pattern[1] !== '(') {
      ignorePatterns.push(pattern.slice(1));
    } else {
      matchPatterns.push(pattern);
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

function getFdirBuilder(options: GlobOptions, cwd: string) {
  const processed = processPatterns(options);

  const matcher = picomatch(processed.match, {
    dot: options.dot,
    ignore: processed.ignore
  });

  const fdirOptions: Partial<FdirOptions> = {
    // use relative paths in the matcher
    filters: [options.absolute ? p => matcher(p.slice(cwd.length + 1)) : matcher],
    relativePaths: true
  };

  if (options.absolute) {
    fdirOptions.relativePaths = false;
    fdirOptions.resolvePaths = true;
    fdirOptions.includeBasePath = true;
  }

  if (options.onlyDirectories) {
    fdirOptions.excludeFiles = true;
    fdirOptions.includeDirs = true;
  }

  return new fdir(fdirOptions);
}

export async function glob(options: GlobOptions | undefined = {}): Promise<string[]> {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  return getFdirBuilder(options, cwd).crawl(cwd).withPromise();
}

export function globSync(options: GlobOptions | undefined = {}): string[] {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  return getFdirBuilder(options, cwd).crawl(cwd).sync();
}
