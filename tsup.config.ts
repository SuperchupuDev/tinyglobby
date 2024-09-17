import { type Options, defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node12'
}) as Options;
