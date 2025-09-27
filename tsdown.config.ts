import { defineConfig, type UserConfig } from 'tsdown/config';

export default defineConfig({
  fixedExtension: true,
  format: ['esm', 'cjs'],
  nodeProtocol: 'strip',
  sourcemap: !process.env.IS_RELEASE,
}) as UserConfig;
