# tinyglobby

<a href="https://www.npmjs.com/package/tinyglobby"><img src="https://img.shields.io/npm/v/tinyglobby.svg?maxAge=3600" alt="npm version" /></a>

A fast and minimal alternative to globby and fast-glob, meant to behave the same way.

Both globby and fast-glob present some behavior no other globbing lib has,
which makes it hard to manually replace with something smaller and better.

This library uses only two subdependencies, unlike globby's [24](https://npmgraph.js.org/?q=globby@14.0.4) and fast-glob's [17](https://npmgraph.js.org/?q=fast-glob@3.3.2).

## Usage

```js
import { glob } from 'tinyglobby';

await glob({ patterns: ['src/*.ts', '!**/*.d.ts'] });
```

```js
import { globSync } from 'tinyglobby';

globSync({ patterns: ['src/*.ts', '!**/*.d.ts'] });
```

## Options

- `patterns`: An array of glob patterns to search for. If not present returns every file in the cwd.
- `ignore`: An array of glob patterns to ignore.
- `cwd`: The current working directory in which to search. Defaults to `process.cwd()`.
- `absolute`: Whether to return absolute paths. Defaults to `false`.
