import nativeFs from 'node:fs';
import { posix } from 'node:path';
import { type Options as FdirOptions, fdir, type PathsOutput } from 'fdir';
import picomatch, { type PicomatchOptions } from 'picomatch';
import type {
  APIBuilder,
  GlobCrawler,
  GlobOptions,
  InternalProps,
  PartialMatcherOptions,
  ProcessedPatterns
} from './types.ts';
import { buildFormat, buildRelative, getPartialMatcher, log } from './utils.ts';

const BACKSLASHES = /\\/g;

// #region getRelativePath
// TODO: this is slow, find a better way to do this
export function getRelativePath(path: string, cwd: string, root: string): string {
  return posix.relative(cwd, `${root}/${path}`) || '.';
}
// #endregion

// #region processPath
function processPath(path: string, cwd: string, root: string, isDirectory: boolean, absolute?: boolean) {
  const relativePath = absolute ? path.slice(root === '/' ? 1 : root.length + 1) || '.' : path;

  if (root === cwd) {
    return isDirectory && relativePath !== '.' ? relativePath.slice(0, -1) : relativePath;
  }

  return getRelativePath(relativePath, cwd, root);
}
// #endregion processPath

// #region buildFdir
export function buildFdir(
  options: GlobOptions,
  props: InternalProps,
  processed: ProcessedPatterns,
  cwd: string,
  root: string
): APIBuilder<PathsOutput> {
  const { absolute, debug, followSymbolicLinks, onlyDirectories } = options;
  const nocase = !options.caseSensitiveMatch;

  const matcher = picomatch(processed.match, {
    dot: options.dot,
    nocase,
    ignore: processed.ignore
  });

  const partialMatcherOptions: PartialMatcherOptions = { dot: options.dot, nocase };
  const ignore = picomatch(processed.ignore, partialMatcherOptions);
  const partialMatcher = getPartialMatcher(processed.match, partialMatcherOptions);
  let maxDepth: number | undefined;
  if (options.deep !== undefined) {
    maxDepth = Math.round(options.deep - props.depthOffset);
  }
  return new fdir({
    filters: [
      (p, isDirectory) => {
        const path = processPath(p, cwd, root, isDirectory, absolute);
        const matches = matcher(path);
        if (debug && matches) {
          log(`matched ${path}`);
        }
        return matches;
      }
    ],
    exclude: (_, p) => {
      const relativePath = processPath(p, cwd, root, true, true);
      const skipped = (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
      if (debug) {
        log(`${skipped ? 'skipped' : 'crawling'} ${p}`);
      }
      return skipped;
    },
    pathSeparator: '/',
    relativePaths: !absolute,
    resolvePaths: absolute,
    includeBasePath: absolute,
    resolveSymlinks: followSymbolicLinks,
    excludeSymlinks: !followSymbolicLinks,
    excludeFiles: onlyDirectories,
    includeDirs: onlyDirectories || !options.onlyFiles,
    maxDepth
  }).crawl(root);
}
// #endregion buildFdir

export function buildFDir2(props: InternalProps, options: GlobOptions, processed: ProcessedPatterns): GlobCrawler {
  const matchOptions = {
    dot: options.dot,
    nobrace: options.braceExpansion === false,
    nocase: options.caseSensitiveMatch === false,
    noextglob: options.extglob === false,
    noglobstar: options.globstar === false,
    posix: true
  } satisfies PicomatchOptions;

  const cwd = props.root;
  const matcher = picomatch(processed.match, { ...matchOptions, ignore: processed.ignore });
  const ignore = picomatch(processed.ignore, matchOptions);
  const partialMatcher = getPartialMatcher(processed.match, matchOptions);

  const format = buildFormat(cwd, props.root, options.absolute);
  const formatExclude = options.absolute ? format : buildFormat(cwd, props.root, true);
  const fdirOptions: Partial<FdirOptions> = {
    // use relative paths in the matcher
    filters: [
      options.debug
        ? (p, isDirectory) => {
            const path = format(p, isDirectory);
            const matches = matcher(path);

            if (matches) {
              log(`matched ${path}`);
            }

            return matches;
          }
        : (p, isDirectory) => matcher(format(p, isDirectory))
    ],
    exclude: options.debug
      ? (_, p) => {
          const relativePath = formatExclude(p, true);
          const skipped = (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);

          if (skipped) {
            log(`skipped ${p}`);
          } else {
            log(`crawling ${p}`);
          }

          return skipped;
        }
      : (_, p) => {
          const relativePath = formatExclude(p, true);
          return (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
        },
    fs: options.fs
      ? {
          readdir: options.fs.readdir || nativeFs.readdir,
          readdirSync: options.fs.readdirSync || nativeFs.readdirSync,
          realpath: options.fs.realpath || nativeFs.realpath,
          realpathSync: options.fs.realpathSync || nativeFs.realpathSync,
          stat: options.fs.stat || nativeFs.stat,
          statSync: options.fs.statSync || nativeFs.statSync
        }
      : undefined,
    pathSeparator: '/',
    relativePaths: true,
    resolveSymlinks: true,
    signal: options.signal
  };

  if (options.deep !== undefined) {
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
  const relative = cwd !== root && !options.absolute && buildRelative(cwd, props.root);
  return { crawler: new fdir(fdirOptions).crawl(root), relative } as const;
}
