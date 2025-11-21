import nativeFs from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCrawler } from './crawler.ts';
import type { Crawler, FileSystemAdapter, GlobInput, GlobOptions, InternalOptions, RelativeMapper } from './types.ts';
import { BACKSLASHES, ensureStringArray, isReadonlyArray, log } from './utils.ts';

function formatPaths(paths: string[], mapper?: false | RelativeMapper) {
  if (mapper) {
    for (let i = paths.length - 1; i >= 0; i--) {
      paths[i] = mapper(paths[i]);
    }
  }
  return paths;
}

const fsKeys = ['readdir', 'readdirSync', 'realpath', 'realpathSync', 'stat', 'statSync'];

function normalizeFs(fs?: Record<string, unknown>): FileSystemAdapter | undefined {
  if (fs && fs !== nativeFs) {
    for (const key of fsKeys) {
      fs[key] = (fs[key] ? fs : (nativeFs as Record<string, unknown>))[key];
    }
  }
  return fs;
}

// Object containing all default options to ensure there is no hidden state difference
// between false and undefined.
const defaultOptions: GlobOptions = {
  caseSensitiveMatch: true,
  cwd: process.cwd(),
  debug: !!process.env.TINYGLOBBY_DEBUG,
  expandDirectories: true,
  followSymbolicLinks: true,
  onlyFiles: true
};

function getOptions(options?: GlobOptions): InternalOptions {
  const opts = { ...defaultOptions, ...options } as InternalOptions;

  opts.cwd = (opts.cwd instanceof URL ? fileURLToPath(opts.cwd) : resolve(opts.cwd)).replace(BACKSLASHES, '/');
  // Default value of [] will be inserted here if ignore is undefined
  opts.ignore = ensureStringArray(opts.ignore);
  opts.fs = normalizeFs(opts.fs);

  if (opts.debug) {
    log('globbing with options:', opts);
  }

  return opts;
}

function getCrawler(globInput: GlobInput, inputOptions: GlobOptions = {}): [] | [Crawler, false | RelativeMapper] {
  if (globInput && inputOptions?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const isModern = isReadonlyArray(globInput) || typeof globInput === 'string';
  // defaulting to ['**/*'] is tinyglobby exclusive behavior, deprecated
  const patterns = ensureStringArray((isModern ? globInput : globInput.patterns) ?? '**/*');
  const options = getOptions(isModern ? inputOptions : globInput);

  return patterns.length > 0 ? buildCrawler(options, patterns) : [];
}

/**
 * Asynchronously match files following a glob pattern.
 * @see {@link https://superchupu.dev/tinyglobby/documentation#glob}
 */
export function glob(patterns: string | readonly string[], options?: Omit<GlobOptions, 'patterns'>): Promise<string[]>;
/**
 * @deprecated Provide patterns as the first argument instead.
 */
export function glob(options: GlobOptions): Promise<string[]>;
export async function glob(globInput: GlobInput, options?: GlobOptions): Promise<string[]> {
  const [crawler, relative] = getCrawler(globInput, options);
  return crawler ? formatPaths(await crawler.withPromise(), relative) : [];
}

/**
 * Synchronously match files following a glob pattern.
 * @see {@link https://superchupu.dev/tinyglobby/documentation#globSync}
 */
export function globSync(patterns: string | readonly string[], options?: Omit<GlobOptions, 'patterns'>): string[];
/**
 * @deprecated Provide patterns as the first argument instead.
 */
export function globSync(options: GlobOptions): string[];
export function globSync(globInput: GlobInput, options?: GlobOptions): string[] {
  const [crawler, relative] = getCrawler(globInput, options);
  return crawler ? formatPaths(crawler.sync(), relative) : [];
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
 * @param patternsOrOptions The glob pattern(s) or a full `GlobOptions` object.
 * @param options The options object if the first argument is the pattern(s).
 * @yields A readonly tuple `[glob, matcher]` containing:
 * - `glob`: The normalized and processed glob pattern.
 * - `matcher`: The pre-compiled matcher function for that specific pattern.
 * @returns A generator that yields the `[glob, matcher]` tuples.
 *
 * @example Implementing deterministic sorting of `globSync` results
 * ```javascript
 * // Assume the following file structure:
 * // /project
 * // └── src
 * //     └── components
 * //         ├── common
 * //         │   ├── Button.js
 * //         │   └── Card.js
 * //         └── overrides
 * //             └── Button.js
 *
 * import { globSync, compileGlobs } from 'tinyglobby';
 *
 * // 1. Define your globs and options ONCE.
 * // The order of this array defines the desired sorting precedence.
 * const globs = [
 *   `src/components/overrides/**`, // Highest priority
 *   'src/components/common/**',   // Normal priority
 * ];
 * const options = { cwd: '/project', absolute: true };
 *
 * // 2. Scan the filesystem using the defined globs.
 * // `globSync` uses the patterns to find files but does not guarantee order.
 * const files = globSync(globs, options);
 * // Let's assume `files` is now (in a non-deterministic order):
 * // [
 * //   '/project/src/components/common/Button.js',
 * //   '/project/src/components/common/Card.js',
 * //   '/project/src/components/overrides/Button.js'
 * // ]
 *
 * // 3. Compile the exact same globs to get matchers in their intended order.
 * const matchersGenerator = compileGlobs(globs, options);
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
 * //   '/project/src/components/overrides/Button.js',
 * //   '/project/src/components/common/Button.js',
 * //   '/project/src/components/common/Card.js'
 * // ]
 * ```
 */
export function* compileGlobs(
  patternsOrOptions: string | readonly string[] | GlobOptions,
  options?: GlobOptions
): Generator<readonly [glob: string, match: (path: string) => boolean], undefined, void> {
  if (patternsOrOptions && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const isModern = isReadonlyArray(patternsOrOptions) || typeof patternsOrOptions === 'string';
  const inputOptions = (isModern ? options : patternsOrOptions) || {};
  const patterns = isModern ? patternsOrOptions : patternsOrOptions.patterns;

  const useOptions = process.env.TINYGLOBBY_DEBUG ? { ...inputOptions, debug: true } : inputOptions;
  const cwd = normalizeCwd(useOptions.cwd);
  if (useOptions.debug) {
    log('globbing with:', { patterns, options: useOptions, cwd });
  }

  const props = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };

  const processed = processPatterns({ ...useOptions, patterns }, cwd, props);

  if (useOptions.debug) {
    log('internal processing patterns:', processed);
  }

  const matchOptions = {
    dot: useOptions.dot,
    nobrace: useOptions.braceExpansion === false,
    nocase: useOptions.caseSensitiveMatch === false,
    noextglob: useOptions.extglob === false,
    noglobstar: useOptions.globstar === false,
    posix: true
  } satisfies PicomatchOptions;

  const format = buildFormat(cwd, props.root, inputOptions.absolute);

  for (const match of processed.match) {
    const isMatch = picomatch(match, { ...matchOptions, ignore: processed.ignore });

    yield [match, (filePath: string): boolean => isMatch(format(filePath, false))] as const;
  }
}

export type { GlobOptions } from './types.ts';
export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
