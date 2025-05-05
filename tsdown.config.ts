import { type Options, defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  removeNodeProtocol: true,
  sourcemap: !process.env.IS_RELEASE,
  target: 'node12'
}) as Options;
