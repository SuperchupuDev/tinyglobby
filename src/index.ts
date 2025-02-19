import path, { posix } from 'node:path';
import { escapePath, isDynamicPattern, log, splitPattern } from './utils.ts';
import type { GlobOptions, Input, InternalProps, ProcessedPatterns } from './types.ts';
import { buildFdir, formatPaths } from './fdir.ts';

const PARENT_DIRECTORY = /^(\/?\.\.)+/;
const ESCAPING_BACKSLASHES = /\\(?=[()[\]{}!*+?@|])/g;
const BACKSLASHES = /\\/g;

function normalizePattern(
  pattern: string,
  expandDirectories: boolean,
  cwd: string,
  props: InternalProps,
  isIgnore: boolean
) {
  let result: string = pattern;
  if (pattern.endsWith('/')) {
    result = pattern.slice(0, -1);
  }
  // using a directory as entry should match all files inside it
  if (!result.endsWith('*') && expandDirectories) {
    result += '/**';
  }

  if (path.isAbsolute(result.replace(ESCAPING_BACKSLASHES, ''))) {
    result = posix.relative(escapePath(cwd), result);
  } else {
    result = posix.normalize(result);
  }

  const parentDirectoryMatch = PARENT_DIRECTORY.exec(result);
  if (parentDirectoryMatch?.[0]) {
    const potentialRoot = posix.join(cwd, parentDirectoryMatch[0]);
    if (props.root.length > potentialRoot.length) {
      props.root = potentialRoot;
      props.depthOffset = -(parentDirectoryMatch[0].length + 1) / 3;
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

function processPatterns(
  { patterns, ignore = [], expandDirectories = true }: GlobOptions,
  cwd: string,
  props: InternalProps
): ProcessedPatterns {
  if (typeof patterns === 'string') {
    patterns = [patterns];
  } else if (!patterns) {
    // tinyglobby exclusive behavior, should be considered deprecated
    patterns = ['**/*'];
  }

  if (typeof ignore === 'string') {
    ignore = [ignore];
  }

  const matchPatterns: string[] = [];
  const ignorePatterns: string[] = [];

  for (const pattern of ignore) {
    if (!pattern) {
      continue;
    }
    // don't handle negated patterns here for consistency with fast-glob
    if (pattern[0] !== '!' || pattern[1] === '(') {
      ignorePatterns.push(normalizePattern(pattern, expandDirectories, cwd, props, true));
    }
  }

  for (const pattern of patterns) {
    if (!pattern) {
      continue;
    }
    if (pattern[0] !== '!' || pattern[1] === '(') {
      matchPatterns.push(normalizePattern(pattern, expandDirectories, cwd, props, false));
    } else if (pattern[1] !== '!' || pattern[2] === '(') {
      ignorePatterns.push(normalizePattern(pattern.slice(1), expandDirectories, cwd, props, true));
    }
  }

  return { match: matchPatterns, ignore: ignorePatterns };
}

function getOptions(input: Input, options?: Partial<GlobOptions>): GlobOptions {
  const opts = Array.isArray(input) || typeof input === 'string' ? { ...options, patterns: input } : input;
  opts.cwd = (opts.cwd ? path.resolve(opts.cwd) : process.cwd()).replace(BACKSLASHES, '/');
  return opts as GlobOptions
}

function crawl(input: Input, options: Partial<GlobOptions> | undefined, sync: false): Promise<string[]>;
function crawl(input: Input, options: Partial<GlobOptions> | undefined, sync: true): string[];
function crawl(input: Input, options: Partial<GlobOptions> | undefined, sync: boolean) {
  const opts = getOptions(input, options);
  const cwd = opts.cwd;

  if (process.env.TINYGLOBBY_DEBUG) {
    opts.debug = true;
  }

  if (opts.debug) {
    log('globbing with options:', opts, 'cwd:', cwd);
  }

  if (Array.isArray(opts.patterns) && opts.patterns.length === 0) {
    return sync ? [] : Promise.resolve([]);
  }

  const props: InternalProps = {
    root: cwd,
    commonPath: null,
    depthOffset: 0
  };

  const processed = processPatterns(opts, cwd, props);
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

function validateInput(input: Input, options?: Partial<GlobOptions>) {
  if (input && options?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option.')
  }
}

export function glob(patterns: string | string[], options?: Omit<Partial<GlobOptions>, 'patterns'>): Promise<string[]>;
export function glob(options: Partial<GlobOptions>): Promise<string[]>;
export async function glob(input: Input, options?: Partial<GlobOptions>): Promise<string[]> {
  validateInput(input, options);
  return crawl(input, options, false);
}

export function globSync(patterns: string | string[], options?: Omit<Partial<GlobOptions>, 'patterns'>): string[];
export function globSync(options: Partial<GlobOptions>): string[];
export function globSync(input: Input, options?: Partial<GlobOptions>): string[] {
  validateInput(input, options);
  return crawl(input, options, true);
}

export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
