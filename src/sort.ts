import picomatch from 'picomatch';
import { buildCrawlerInfo } from './crawler.ts';
import { getOptions } from './options.ts';
import type { CrawlerInfo, GlobOptions, Sort } from './types.ts';
import { ensureStringArray } from './utils.ts';

export function* internalCompileMatchers(
  crawlerInfo: CrawlerInfo
): Generator<readonly [glob: string, match: (path: string) => boolean], undefined, void> {
  const { processed, matchOptions, format } = crawlerInfo;
  for (const match of processed.match) {
    const isMatch = picomatch(match, { ...matchOptions, ignore: processed.ignore });
    yield [match, (filePath: string): boolean => isMatch(format(filePath, false))] as const;
  }
}
/**
 * Compiles glob patterns into matcher functions using the exact same logic as `glob` and `globSync`.
 *
 * This is an advanced utility function designed to be a **companion** to `glob` and `globSync`.
 * Its primary use case is to enable advanced post-processing of the files returned by a scan.
 *
 * For example, since the order of files from a glob scan is not guaranteed, this function
 * provides the necessary tools to implement **deterministic sorting**. By yielding a matcher for
 * each original pattern, you can iterate through them in their intended order of precedence
 * and sort the results of a `globSync` call accordingly.
 *
 * This function is key because it uses the **exact same internal pattern normalization and
 * option processing as `glob` and `globSync`**. This guarantees that your post-processing
 * logic (like sorting) will be perfectly consistent with the file scan that produced the results.
 *
 * A key benefit of this approach is **decoupling**. Your code only depends on
 * the returned matcher's signature `(path: string) => boolean`, not on the
 * underlying matching library (currently `picomatch`). If `tinyglobby` were to
 * switch to a different matching engine in the future, your code using this
 * function would continue to work without any changes.
 *
 * @param patterns The glob pattern(s).
 * @param options The options.
 * @yields A readonly tuple `[glob, matcher]` containing:
 * - `glob`: The normalized and processed glob pattern.
 * - `matcher`: The pre-compiled matcher function for that specific pattern.
 * @returns A generator that yields the `[glob, matcher]` tuples.
 *
 * @example Implementing deterministic sorting of `globSync` results
 * ```javascript
 * // Assume the following file structure:
 * // /project
 * // ├── common
 * // │   ├── Button.js
 * // │   └── Card.js
 * // └── overrides
 * //     └── Button.js
 *
 * import { globSync, compileMatchers } from 'tinyglobby';
 *
 * // 1. Define your globs and options ONCE.
 * // The order of this array defines the desired sorting precedence.
 * const globs = [
 *   'overrides/**' + '/*.js', // Highest priority
 *   'common/**' + '/*.js',   // Normal priority
 * ];
 * const options = { cwd: '/project', absolute: true };
 *
 * // 2. Scan the filesystem using the defined globs.
 * // `globSync` uses the patterns to find files but does not guarantee order.
 * const files = globSync(globs, options);
 * // Let's assume `files` is now (in a non-deterministic order):
 * // [
 * //   '/project/common/Button.js',
 * //   '/project/common/Card.js',
 * //   '/project/overrides/Button.js'
 * // ]
 *
 * // 3. Compile the exact same globs to get matchers in their intended order.
 * const matchersGenerator = compileMatchers(globs, options);
 *
 * // 4. Use the generated matchers to sort the file list.
 * const sortedFiles = [];
 * const processedFiles = new Set();
 *
 * for (const [glob, match] of matchersGenerator) {
 *   for (const file of files) {
 *     if (!processedFiles.has(file) && match(file)) {
 *       processedFiles.add(file);
 *       sortedFiles.push(file);
 *     }
 *   }
 * }
 *
 * console.log(sortedFiles);
 * // The correctly sorted output, respecting the original glob order:
 * // [
 * //   '/project/overrides/Button.js',
 * //   '/project/common/Button.js',
 * //   '/project/common/Card.js'
 * // ]
 * ```
 */
export function* compileMatchers(
  patterns: string | readonly string[],
  options?: Omit<GlobOptions, 'patterns'>
): Generator<readonly [glob: string, match: (path: string) => boolean], undefined, void> {
  yield* internalCompileMatchers(buildCrawlerInfo(getOptions(options), ensureStringArray(patterns)));
}

const sortAsc = (a: string, b: string) => a.localeCompare(b);
const sortDesc = (a: string, b: string) => b.localeCompare(a);

export function internalSortFiles(files: string[], crawlerInfo: CrawlerInfo, sort?: Sort): string[] {
  switch (true) {
    case typeof sort === 'function':
      return files.sort(sort);
    case sort === 'asc':
      return files.sort(sortAsc);
    case sort === 'desc':
      return files.sort(sortDesc);
    case sort === 'pattern':
    case sort === 'pattern-asc':
    case sort === 'pattern-desc':
      return [...internalSortFilesByPatternPrecedence(files, crawlerInfo, sort)];
    default:
      return files;
  }
}

/**
 * Sort files from a glob scan.
 * @param files The files from a glob scan.
 * @param patterns The glob pattern(s).
 * @param options The options.
 * @returns The files from a glob scan sorted.
 */
export function sortFiles(
  files: string[],
  patterns: string | readonly string[],
  options?: Omit<GlobOptions, 'patterns'>
): string[] {
  switch (true) {
    case typeof options?.sort === 'function':
      return files.sort(options.sort);
    case options?.sort === 'asc':
      return files.sort(sortAsc);
    case options?.sort === 'desc':
      return files.sort(sortDesc);
    case options?.sort === 'pattern':
    case options?.sort === 'pattern-asc':
    case options?.sort === 'pattern-desc':
      return [...sortFilesByPatternPrecedence(files, patterns, options)];
    default:
      return files;
  }
}

export function* internalSortFilesByPatternPrecedence(
  files: string[],
  crawlerInfo: CrawlerInfo,
  sort?: Sort
): Generator<string, undefined, void> {
  sort ??= 'pattern';
  if (sort !== 'pattern' && sort !== 'pattern-asc' && sort !== 'pattern-desc') {
    for (const file of files) {
      yield file;
    }
    return;
  }

  const matcher = internalCompileMatchers(crawlerInfo);
  const processedFiles = new Set<string>();
  if (sort === 'pattern') {
    for (const [_, match] of matcher) {
      for (const file of files) {
        if (!processedFiles.has(file) && match(file)) {
          processedFiles.add(file);
          yield file;
        }
      }
    }
  } else {
    const matches: string[] = [];
    const sortFn = sort === 'pattern-asc' ? sortAsc : sortDesc;
    for (const [_, match] of matcher) {
      for (const file of files) {
        if (!processedFiles.has(file) && match(file)) {
          processedFiles.add(file);
          matches.push(file);
        }
      }
      yield* matches.sort(sortFn);
      matches.length = 0;
    }
  }
}

/**
 * Sort files from a glob scan.
 * @param files The files from a glob scan.
 * @param patterns The glob pattern(s).
 * @param options The options.
 * @yields The files from a glob scan sorted.
 */
export function* sortFilesByPatternPrecedence(
  files: string[],
  patterns: string | readonly string[],
  options?: Omit<GlobOptions, 'patterns'>
): Generator<string, undefined, void> {
  yield* internalSortFilesByPatternPrecedence(
    files,
    buildCrawlerInfo(getOptions(options), ensureStringArray(patterns)),
    options?.sort
  );
}
