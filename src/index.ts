import { fdir } from 'fdir';
import picomatch from 'picomatch';

export interface GlobOptions {
  absolute?: boolean;
  cwd?: string;
  patterns?: string[];
  ignore?: string[];
  expandDirectories?: boolean;
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
  if (!patterns) {
    return null;
  }
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = ignore.map(p => (!p.endsWith('*') && expandDirectories ? expandDir(p) : p));
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

function getFdirBuilder(options: GlobOptions) {
  const processed = processPatterns(options);

  const fdirOptions = processed
    ? {
        filters: [
          picomatch(processed.match, {
            dot: true,
            ignore: processed.ignore,
            windows: process.platform === 'win32'
          })
        ]
      }
    : undefined;

  return options.absolute ? new fdir(fdirOptions).withFullPaths() : new fdir(fdirOptions).withRelativePaths();
}

export async function glob(options: GlobOptions | undefined = {}): Promise<string[]> {
  return getFdirBuilder(options)
    .crawl(options.cwd ?? process.cwd())
    .withPromise();
}

export function globSync(options: GlobOptions | undefined = {}): string[] {
  return getFdirBuilder(options)
    .crawl(options.cwd ?? process.cwd())
    .sync();
}
