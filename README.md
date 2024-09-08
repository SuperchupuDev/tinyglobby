# tinyglobby

<a href="https://www.npmjs.com/package/tinyglobby">
  <img src="https://img.shields.io/npm/v/tinyglobby.svg?maxAge=3600" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/tinyglobby.svg?maxAge=3600" alt="monthly downloads" />
</a>

A fast and minimal alternative to globby and fast-glob, meant to behave the same way.

Both globby and fast-glob present some behavior no other globbing lib has,
which makes it hard to manually replace with something smaller and better.

This library uses only two subdependencies, unlike globby's [23](https://npmgraph.js.org/?q=globby@14.0.2) and fast-glob's [17](https://npmgraph.js.org/?q=fast-glob@3.3.2).

## Usage

```js
import { glob, globSync } from 'tinyglobby';

await glob(['files/*.ts', '!**/*.d.ts'], { cwd: 'src' });
globSync(['src/**/*.ts'], { ignore: ['**/*.d.ts'] });
```

## Options

- `patterns`: An array of glob patterns to search for. Defaults to `['**/*']`.
- `ignore`: An array of glob patterns to ignore.
- `cwd`: The current working directory in which to search. Defaults to `process.cwd()`.
- `absolute`: Whether to return absolute paths. Defaults to `false`.
- `dot`: Whether to allow entries starting with a dot. Defaults to `false`.
- `deep`: Maximum depth of a directory. Defaults to `Infinity`.
- `caseSensitiveMatch`: Whether to match in case-sensitive mode. Defaults to `true`.
- `expandDirectories`: Whether to expand directories. Disable to best match `fast-glob`. Defaults to `true`.
- `onlyDirectories`: Enable to only return directories. Disables `onlyFiles` if set. Defaults to `false`.
- `onlyFiles`: Enable to only return files. Defaults to `true`.

## Used by

`tinyglobby` is downloaded many times by projects all around the world. Here's a list of notable projects that use it:

<!-- should be sorted by weekly download count -->
- [`vitest`](https://github.com/vitest-dev/vitest)
- [`tsup`](https://github.com/egoist/tsup)
- [`nuxt`](https://github.com/nuxt/nuxt)
- [`vite-plugin-pwa`](https://github.com/vite-pwa/vite-plugin-pwa)
- [`unocss`](https://github.com/unocss/unocss)
- [`vitepress`](https://github.com/vuejs/vitepress)
- [`pkg.pr.new`](https://github.com/stackblitz-labs/pkg.pr.new)
- Your own project? [Open an issue](https://github.com/SuperchupuDev/tinyglobby/issues)
if you feel like this list is incomplete.
