import { posix } from 'node:path';
import { type ExcludePredicate, type FSLike, fdir } from 'fdir';
import picomatch, { type PicomatchOptions } from 'picomatch';
import processPatterns from './patterns.ts';
import type { Crawler, InternalOptions, InternalProps, PartialMatcher, RelativeMapper } from './types.ts';
import { BACKSLASHES, buildFormat, buildRelative, getPartialMatcher, log } from './utils.ts';

const PARENT_PREFIX = /^(?:\.\.\/)*\.\.(?=\/|$)/;

function buildParentMatcher(
  patterns: string[],
  cwd: string,
  options: PicomatchOptions,
  partial = false
): PartialMatcher {
  const parentPatterns = new Map<string, string[]>();
  for (const pattern of patterns) {
    const prefix = PARENT_PREFIX.exec(pattern)?.[0];
    if (prefix) {
      const group = parentPatterns.get(prefix);
      if (group) {
        group.push(pattern);
      } else {
        parentPatterns.set(prefix, [pattern]);
      }
    }
  }

  const factory = partial ? getPartialMatcher : picomatch;
  const canonicalMatcher = factory(patterns, options);
  if (parentPatterns.size === 0) {
    return canonicalMatcher;
  }
  const groups = [...parentPatterns].map(([prefix, patterns]) => ({
    prefix,
    suffix: posix.relative(posix.join(cwd, prefix), cwd),
    matcher: factory(patterns, options)
  }));

  return input => {
    if (canonicalMatcher(input)) {
      return true;
    }
    for (const { prefix, suffix, matcher } of groups) {
      const relative = posix.join(suffix, input);
      if (relative === '..' || relative.startsWith('../')) {
        continue;
      }
      // Preserve the parent prefix when the path points back into cwd.
      if (matcher(relative === '.' ? prefix : `${prefix}/${relative}`)) {
        return true;
      }
    }
    return false;
  };
}

export function buildCrawler(options: InternalOptions, patterns: readonly string[]): [Crawler, false | RelativeMapper] {
  const cwd = options.cwd as string;
  const props: InternalProps = { root: cwd, depthOffset: 0 };
  const processed = processPatterns(options, patterns, props);

  if (options.debug) {
    log('internal processing patterns:', processed);
  }

  const { absolute, caseSensitiveMatch, debug, dot, followSymbolicLinks, onlyDirectories } = options;
  const root = props.root.replace(BACKSLASHES, '');
  // For some of these options, false and undefined are two different states!
  const matchOptions = {
    dot,
    nobrace: options.braceExpansion === false,
    nocase: !caseSensitiveMatch,
    noextglob: options.extglob === false,
    noglobstar: options.globstar === false,
    posix: true
  } satisfies PicomatchOptions;

  const outsideCwd = props.depthOffset < 0;
  const matcher = outsideCwd
    ? buildParentMatcher(processed.match, cwd, matchOptions)
    : picomatch(processed.match, matchOptions);
  const ignore = outsideCwd
    ? buildParentMatcher(processed.ignore, cwd, matchOptions)
    : picomatch(processed.ignore, matchOptions);
  const partialMatcher = outsideCwd
    ? buildParentMatcher(processed.match, cwd, matchOptions, true)
    : getPartialMatcher(processed.match, matchOptions);

  const format = buildFormat(cwd, root, absolute);
  const excludeFormatter = absolute ? format : buildFormat(cwd, root, true);

  const excludePredicate: ExcludePredicate = (_, p): boolean => {
    const relativePath = excludeFormatter(p, true);
    return (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
  };

  let maxDepth: number | undefined;
  if (options.deep !== undefined) {
    maxDepth = Math.round(options.deep - props.depthOffset);
  }

  const crawler = new fdir({
    // use relative paths in the matcher
    filters: [
      debug
        ? (p, isDirectory) => {
            const path = format(p, isDirectory);
            const matches = matcher(path) && !ignore(path);

            if (matches) {
              log(`matched ${path}`);
            }

            return matches;
          }
        : (p, isDirectory) => {
            const path = format(p, isDirectory);
            return matcher(path) && !ignore(path);
          }
    ],
    exclude: debug
      ? (_, p) => {
          const skipped = excludePredicate(_, p);
          log(`${skipped ? 'skipped' : 'crawling'} ${p}`);
          return skipped;
        }
      : excludePredicate,
    fs: options.fs as FSLike,
    pathSeparator: '/',
    relativePaths: !absolute,
    resolvePaths: absolute,
    includeBasePath: absolute,
    resolveSymlinks: followSymbolicLinks,
    excludeSymlinks: !followSymbolicLinks,
    excludeFiles: onlyDirectories,
    includeDirs: onlyDirectories || !options.onlyFiles,
    maxDepth,
    signal: options.signal
  }).crawl(root);

  if (options.debug) {
    log('internal properties:', { ...props, root });
  }

  return [crawler, cwd !== root && !absolute && buildRelative(cwd, root)];
}
// #endregion buildCrawler
