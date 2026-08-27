import { config } from 'dotenv';
import { resolve } from 'path';

/**
 * Preparação do ambiente de teste.
 *
 * `override: true` não é detalhe: sem ele o dotenv respeita uma DATABASE_URL
 * que já esteja no ambiente, e o shell de quem rodou `npm run dev` antes
 * carrega a de desenvolvimento. O teste então apagaria o banco de trabalho de
 * alguém achando que está num descartável.
 */
config({ path: resolve(__dirname, '.env.test'), override: true });

/**
 * A trava que impede a suíte de apagar um banco que não seja o dela.
 *
 * ISTO NASCEU DE UM ESTRAGO REAL. Durante a Fase 2 o `.env.development` e o
 * `.env.test` apontavam para o MESMO banco. Cada `npm test` fazia
 * `TRUNCATE ... CASCADE` em todas as tabelas, e o ambiente de desenvolvimento
 * — loja, produtos, conta de admin — era apagado junto, várias vezes, sem
 * nenhum aviso. A pessoa só descobria ao tentar entrar e não conseguir.
 *
 * A checagem antiga olhava só o HOST, e por isso não pegou nada: os dois
 * bancos eram `localhost`. Um host local não diz que o banco é descartável.
 *
 * Agora são três camadas, da mais barata à mais convincente:
 *
 *   1. host local        — barra qualquer banco remoto, produção inclusive
 *   2. porta e nome      — barra outro banco local que não seja o de teste
 *   3. MARCADOR no banco — a autoritativa
 *
 * A terceira é a que vale. As duas primeiras são convenção e podem ser
 * contornadas por engano — alguém cria um `velnoxia_test` em outro lugar e
 * pronto. O marcador é uma tabela que existe SÓ no banco descartável, criada
 * de propósito por `npm run test:db:up`, e que nenhum banco de trabalho tem.
 * A suíte se recusa a rodar sem encontrá-la.
 *
 * E o marcador nunca é criado aqui. Se este arquivo o criasse, a trava se
 * abriria sozinha no primeiro banco em que fosse apontada — que é exatamente
 * o acidente que ela existe para impedir.
 */

const BANCO_DE_TESTE = 'velnoxia_test';
const PORTA_DE_TESTE = '5433';
const HOSTS_LOCAIS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];
const TABELA_MARCADORA = '_banco_descartavel';

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL não definida para testes.\n' +
      'Rode: cp .env.test.example .env.test && npm run test:db:up',
  );
}

const alvo = (() => {
  try {
    return new URL(url);
  } catch {
    throw new Error('DATABASE_URL dos testes não é uma URL válida.');
  }
})();

const nomeDoBanco = alvo.pathname.replace(/^\//, '');

function recusar(motivo: string): never {
  throw new Error(
    `RECUSADO: a suíte só roda contra o banco de teste.\n\n` +
      `  ${motivo}\n\n` +
      `  encontrado: ${alvo.hostname}:${alvo.port || '5432'}/${nomeDoBanco}\n` +
      `  esperado:   localhost:${PORTA_DE_TESTE}/${BANCO_DE_TESTE}\n\n` +
      `A suíte apaga TODAS as tabelas do banco em que roda. Se ela apontar para\n` +
      `o banco de desenvolvimento, o seu ambiente vai embora — loja, produtos e\n` +
      `conta de acesso.\n\n` +
      `Corrija com:\n` +
      `  cp .env.test.example .env.test\n` +
      `  npm run test:db:up`,
  );
}

// 1. Lista de permissão, e não de proibição: um endereço remoto novo, que
//    ninguém lembrou de proibir, continua barrado por padrão.
if (!HOSTS_LOCAIS.includes(alvo.hostname)) {
  recusar('O banco não é local — provavelmente é o de produção.');
}

// 2. Local não basta: o banco de desenvolvimento também é local.
if (nomeDoBanco !== BANCO_DE_TESTE) {
  recusar(`O banco se chama "${nomeDoBanco}", e não "${BANCO_DE_TESTE}".`);
}
if ((alvo.port || '5432') !== PORTA_DE_TESTE) {
  recusar(`A porta é ${alvo.port || '5432'}, e o banco de teste vive na ${PORTA_DE_TESTE}.`);
}

/*
 * 3. A autoritativa: o banco precisa se declarar descartável.
 *
 * Nome e porta são convenção. Esta tabela é um fato, e existe só onde a suíte
 * tem permissão de destruir.
 */
const { Client } = await import('pg');
const conexao = new Client({ connectionString: url });
try {
  await conexao.connect();
  const r = await conexao.query(
    `SELECT to_regclass($1) AS tabela`,
    [`public.${TABELA_MARCADORA}`],
  );
  if (!r.rows[0]?.tabela) {
    recusar(
      `O banco não tem a tabela "${TABELA_MARCADORA}", que marca um banco como descartável.\n` +
        `  Só um banco com essa marca pode ser apagado pela suíte.`,
    );
  }
} finally {
  await conexao.end().catch(() => {});
}
