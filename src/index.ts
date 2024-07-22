import { fdir } from 'fdir';
import picomatch from 'picomatch';

function processPatterns(patterns?: string[]) {
  if (!patterns) {
    return null;
  }
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];
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
}

function getFdirBuilder({ absolute, patterns }: GlobOptions | undefined = {}) {
  const processed = processPatterns(patterns);

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

export async function glob({
  absolute = false,
  cwd = process.cwd(),
  patterns
}: GlobOptions | undefined = {}): Promise<string[]> {
  return getFdirBuilder({ absolute, patterns }).crawl(cwd).withPromise();
}

export function globSync({ absolute = false, cwd = process.cwd(), patterns }: GlobOptions | undefined = {}): string[] {
  return getFdirBuilder({ absolute, patterns }).crawl(cwd).sync();
}
