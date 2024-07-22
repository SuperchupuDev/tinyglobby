import { fdir } from 'fdir';
import picomatch from 'picomatch';

function processPatterns(patterns?: string[], ignore?: string[]) {
  if (!patterns) {
    return null;
  }
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = ignore ?? [];
  for (let pattern of patterns) {
    // using a directory as entry should match all files inside it
    if (!pattern.endsWith('*')) {
      if (pattern.endsWith('/')) {
        pattern += '**';
      } else if (pattern.endsWith('\\')) {
        pattern = `${pattern.slice(0, -1)}/**`;
      } else {
        pattern += '/**';
      }
    }
    if (pattern.startsWith('!') && pattern[1] !== '(') {
      ignorePatterns.push(pattern.slice(1));
    } else {
      matchPatterns.push(pattern);
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

export interface GlobOptions {
  absolute?: boolean;
  cwd?: string;
  patterns?: string[];
  ignore?: string[];
}

function getFdirBuilder({ absolute = false, ignore, patterns }: GlobOptions | undefined = {}) {
  const processed = processPatterns(patterns, ignore);

  const options = processed
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

  return absolute ? new fdir(options).withFullPaths() : new fdir(options).withRelativePaths();
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
