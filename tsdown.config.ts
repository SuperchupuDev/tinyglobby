import { defineConfig, type UserConfig } from 'tsdown/config';

export default defineConfig({
  dts: true,
  entry: ['src/index.ts'],
  fixedExtension: true,
  format: ['esm', 'cjs'],
  removeNodeProtocol: true,
  sourcemap: !process.env.IS_RELEASE,
  target: 'node12'
}) as UserConfig;
