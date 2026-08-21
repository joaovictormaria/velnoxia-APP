import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsConfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [react(), tsConfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    // Usar ambiente Node para server tests
    environment: 'node',

    // Configurar Prisma para testes
    setupFiles: ['./vitest.setup.ts'],

    // Incluir e excluir testes
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/__tests__/**',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/dist/**',
      ],
    },

    // Timeouts
    testTimeout: 30000,
    hookTimeout: 30000,

    // Globals (não precisa import de describe/it/expect)
    globals: true,

    // Reporters
    reporters: ['default', 'html'],
    outputFile: {
      html: './test-results/index.html',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
