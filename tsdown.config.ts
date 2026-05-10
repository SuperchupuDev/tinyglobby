import { defineConfig, type UserConfig } from 'tsdown/config';

export default defineConfig({
  format: ['esm', 'cjs'],
  nodeProtocol: 'strip'
}) as UserConfig;
