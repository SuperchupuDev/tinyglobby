import path, { posix } from 'node:path';
import { ensureStringArray, escapePath, isDynamicPattern, log, splitPattern } from './utils.ts';
import type { GlobOptions, Input, InternalProps, ProcessedPatterns } from './types.ts';
import { buildFdir, formatPaths } from './fdir.ts';

const PARENT_DIRECTORY = /^(\/?\.\.)+/;
const ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g;
const BACKSLASHES = /\\/g;

function normalizePattern(pattern: string, props: InternalProps, opts: GlobOptions, isIgnore: boolean): string {
  const cwd = opts.cwd
  let result: string = pattern;
  if (pattern.endsWith('/')) {
    result = pattern.slice(0, -1);
  }
  // using a directory as entry should match all files inside it
  if (!result.endsWith('*') && opts.expandDirectories) {
    result += '/**';
  }

  if (path.isAbsolute(result.replace(ESCAPING_BACKSLASHES, ''))) {
    result = posix.relative(escapePath(cwd), result);
  } else {
    result = posix.normalize(result);
  }

  const parentDir = PARENT_DIRECTORY.exec(result)?.[0];
  if (parentDir) {
    const potentialRoot = posix.join(cwd, parentDir);
    if (props.root.length > potentialRoot.length) {
      props.root = potentialRoot;
      props.depthOffset = -(parentDir.length + 1) / 3;
    }
  } else if (!isIgnore && props.depthOffset >= 0) {
    const parts = splitPattern(result);
    props.commonPath ??= parts;

    const newCommonPath: string[] = [];
    const length = Math.min(props.commonPath.length, parts.length);

    for (let i = 0; i < length; i++) {
      const part = parts[i];

      if (part === '**' && !parts[i + 1]) {
        newCommonPath.pop();
        break;
      }

      if (part !== props.commonPath[i] || isDynamicPattern(part) || i === parts.length - 1) {
        break;
      }

      newCommonPath.push(part);
    }

    props.depthOffset = newCommonPath.length;
    props.commonPath = newCommonPath;

    props.root = newCommonPath.length > 0 ? `${cwd}/${newCommonPath.join('/')}` : cwd;
  }

  return result;
}

function processPatterns(opts: GlobOptions, props: InternalProps): ProcessedPatterns {
  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];

  for (const pattern of opts.ignore) {
    if (!pattern) {
      continue;
    }
    // don't handle negated patterns here for consistency with fast-glob
    if (pattern[0] !== '!' || pattern[1] === '(') {
      ignorePatterns.push(normalizePattern(pattern, props, opts, true));
    }
  }

  for (const pattern of opts.patterns) {
    if (!pattern) {
      continue;
    }
    if (pattern[0] !== '!' || pattern[1] === '(') {
      matchPatterns.push(normalizePattern(pattern, props, opts, false));
    } else if (pattern[1] !== '!' || pattern[2] === '(') {
      ignorePatterns.push(normalizePattern(pattern.slice(1), props, opts, true));
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

function getOptions(input: Input, options?: Partial<GlobOptions>): GlobOptions {
  const opts = {
     // patterns: ['**/*'] is tinyglobby exclusive behavior, should be considered deprecated
    ...{ expandDirectories: true, debug: !!process.env.TINYGLOBBY_DEBUG, ignore: [], patterns: ['**/*'] },
    ...(Array.isArray(input) || typeof input === 'string' ? { ...options, patterns: input } : input)
  };
  opts.cwd = (opts.cwd ? path.resolve(opts.cwd) : process.cwd()).replace(BACKSLASHES, '/');
  opts.ignore = ensureStringArray(opts.ignore)
  opts.patterns = ensureStringArray(opts.patterns)
  return opts as GlobOptions
}

function crawl(input: Input, options: Partial<GlobOptions> | undefined, sync: false): Promise<string[]>;
function crawl(input: Input, options: Partial<GlobOptions> | undefined, sync: true): string[];
function crawl(input: Input, options: Partial<GlobOptions> | undefined, sync: boolean) {
  if (input && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option.')
  }

  const opts = getOptions(input, options);
  const cwd = opts.cwd;

  if (opts.debug) {
    log('globbing with options:', opts, 'cwd:', cwd);
  }

  if (!opts.patterns.length) {
    return sync ? [] : Promise.resolve([]);
  }

  const props: InternalProps = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };

  const processed = processPatterns(opts, props);
  props.root = props.root.replace(BACKSLASHES, '');
  const root = props.root;

  if (opts.debug) {
    log('internal processing patterns:', processed);
    log('internal properties:', props);
  }

  const api = buildFdir(opts, props, processed, cwd, root);

  if (cwd === root || opts.absolute) {
    return sync ? api.sync() : api.withPromise();
  }

  return sync ? formatPaths(api.sync(), cwd, root) : api.withPromise().then(paths => formatPaths(paths, cwd, root));
}

export function glob(patterns: string | string[], options?: Omit<Partial<GlobOptions>, 'patterns'>): Promise<string[]>;
export function glob(options: Partial<GlobOptions>): Promise<string[]>;
export async function glob(input: Input, options?: Partial<GlobOptions>): Promise<string[]> {
  return crawl(input, options, false);
}

export function globSync(patterns: string | string[], options?: Omit<Partial<GlobOptions>, 'patterns'>): string[];
export function globSync(options: Partial<GlobOptions>): string[];
export function globSync(input: Input, options?: Partial<GlobOptions>): string[] {
  return crawl(input, options, true);
}

export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
