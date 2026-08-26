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
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'velnox-landing'],

    /*
     * Um arquivo de teste por vez.
     *
     * Os testes de integração compartilham um único Postgres, e vários deles
     * abrem com `TRUNCATE ... CASCADE` em todas as tabelas para começar do
     * zero. Rodando em paralelo, o truncate de um arquivo apaga o cenário que
     * outro acabou de montar: o segundo falha por um motivo que não tem
     * nada a ver com o código que ele deveria estar exercitando.
     *
     * O efeito medido nesta suíte, mesma árvore, mesma máquina:
     *
     *   paralelo   258 falhas | 187 passes   (e 26 ou 27 arquivos, variando
     *                                         entre execuções idênticas)
     *   série      175 falhas | 270 passes   (23 arquivos, estável)
     *
     * Mais de 80 falhas eram artefato do paralelismo. Pior que o número:
     * em paralelo o resultado não se repete, então "a suíte piorou" deixava
     * de ser uma informação utilizável.
     *
     * O preço é tempo: ~115s contra ~50s. Vale — um resultado reprodutível
     * em dois minutos é mais barato que um instável em cinquenta segundos.
     *
     * Isto NÃO conserta as 175 falhas restantes. Aquelas são reais: testes
     * antigos escritos contra um banco sem foreign keys. São tarefa própria.
     *
     * A correção definitiva seria dar um banco (ou um schema) por worker e
     * devolver o paralelismo. Enquanto isso não existe, serializar é o que
     * torna a suíte legível.
     */
    fileParallelism: false,

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
