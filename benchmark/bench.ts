import assert from 'node:assert/strict';
import { access, glob as native } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { styleText } from 'node:util';
import fastGlob from 'fast-glob';
import { glob } from 'glob';
import { Bench, type BenchOptions } from 'tinybench';
import { glob as tinyglobby } from '../src/index.ts';

try {
  await access(join(import.meta.dirname, 'fixtures', 'typescript-eslint'));
} catch {
  console.error(`${styleText('red', 'Error:')} no benchmark fixtures`);
  console.error(`To generate them, run: ${styleText('blue', 'node --run bench:setup')}`);
  process.exit(1);
}

const cwd = join(import.meta.dirname, 'fixtures', 'typescript-eslint');

type Patterns = string | string[];
type Globber = (patterns: Patterns) => Promise<string[]>;

const globbers = [
  ['tinyglobby', (patterns: Patterns) => tinyglobby(patterns, { expandDirectories: false, cwd })],
  ['fast-glob', (patterns: Patterns) => fastGlob(patterns, { cwd })],
  ['glob', (patterns: Patterns) => glob(patterns, { cwd })],
  ['node:fs glob', (patterns: Patterns) => Array.fromAsync(native(patterns, { cwd }))]
] satisfies [name: string, globber: Globber][];

// patterns always use `/`, but on windows `node:fs` and `glob` yield `\` separated paths, so
// normalize both the patterns we build from them and the results we compare across globbers
const toPosix = (path: string) => path.replaceAll('\\', '/');

async function verify(patterns: Patterns) {
  const [expected, ...results] = await Promise.all(globbers.map(([, globber]) => globber(patterns)));
  const base = expected.map(toPosix).sort();
  for (const result of results) {
    assert.deepEqual(result.map(toPosix).sort(), base);
  }
}

async function runBenchmark(name: string, patterns: Patterns, options: BenchOptions = {}) {
  const bench = new Bench({ ...options, name });
  for (const [taskName, globber] of globbers) {
    bench.add(taskName, async () => {
      await globber(patterns);
    });
  }
  await bench.run();
  console.log(bench.name);
  console.table(bench.table());
}

await runBenchmark('packages/*/tsconfig.json (typescript-eslint)', 'packages/*/tsconfig.json');
await runBenchmark('**/* (typescript-eslint)', '**/*');

const staticPatterns = (await Array.fromAsync(native('packages/ast-spec/**/*.ts', { cwd })))
  .map(toPosix)
  .sort()
  .slice(0, 500);
const highCardinalityOptions = {
  time: 500,
  iterations: 10,
  warmupTime: 100,
  warmupIterations: 3
} satisfies BenchOptions;

await verify(staticPatterns);
await runBenchmark(
  `${staticPatterns.length} static patterns (typescript-eslint)`,
  staticPatterns,
  highCardinalityOptions
);

const mixedPatterns = [...staticPatterns, 'packages/*/src/**/*.ts'];
await verify(mixedPatterns);
await runBenchmark(
  `${staticPatterns.length} static + 1 dynamic pattern (typescript-eslint)`,
  mixedPatterns,
  highCardinalityOptions
);
