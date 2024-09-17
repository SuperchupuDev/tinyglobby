import { type Options, defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  sourcemap: !process.env.IS_RELEASE,
  target: 'node12'
}) as Options;
