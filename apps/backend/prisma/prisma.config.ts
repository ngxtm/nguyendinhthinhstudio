import { defineConfig } from '@prisma/client/generator-build';

export default defineConfig({
  seed: {
    command: 'tsx prisma/seed.ts',
  },
});