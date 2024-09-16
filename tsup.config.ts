import { type Options, defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  sourcemap: true,
  target: 'node12'
}) as Options;
