import { beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

/**
 * Setup file para testes
 * Preparar banco de dados de teste, etc
 */

// Carregar .env.test para testes
config({ path: resolve(__dirname, '.env.test') });

beforeAll(async () => {
  // Verificar DATABASE_URL está disponível
  if (!process.env.DATABASE_URL) {
    console.warn(
      'DATABASE_URL não configurado para testes. ' +
      'Testes que precisam DB real serão pulados ou falharão. ' +
      'Configure .env.test com DATABASE_URL válido.'
    );
  }
});

afterAll(async () => {
  // Cleanup: Fechar conexões, limpar dados, etc
});
