/**
 * Recusa rodar um script deste diretório contra qualquer banco que não seja local.
 *
 * ISTO EXISTE PORQUE O `.env` DA RAIZ APONTA PARA PRODUÇÃO. Os scripts daqui
 * leem `process.env.DATABASE_URL` e nada mais; rodar `npx tsx prisma/seed-extras.ts`
 * numa janela onde o `.env` foi carregado escreve direto no banco dos clientes,
 * sem aviso e sem confirmação. O `scripts/dev.mjs` já documenta que esse acidente
 * aconteceu uma vez, com o formulário de cadastro criando loja real em localhost.
 *
 * A guarda é a mesma de lá, deliberadamente: lista de hosts permitidos, e o que
 * não estiver nela é recusado antes de a primeira consulta sair. Nada de heurística
 * sobre o nome do banco — `railway`, `prod`, `neon` e o que mais vier são todos
 * simplesmente "não é localhost".
 */

/** Os únicos hosts em que um script deste diretório pode tocar. */
const HOSTS_LOCAIS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"];

/**
 * A URL do banco, garantidamente local.
 *
 * Encerra o processo com mensagem explicando o bloqueio quando a URL não é
 * local ou está ausente. Sair aqui é o ponto: o script não chega a abrir conexão.
 */
export function urlDeBancoLocal(): string {
  const url = process.env.DATABASE_URL ?? "";

  if (!url) {
    console.error(
      "\nRECUSADO: DATABASE_URL não está definida.\n\n" +
        "  Os scripts deste diretório só rodam contra banco local. Aponte a\n" +
        "  variável para o banco de desenvolvimento antes de executar:\n\n" +
        "    DATABASE_URL=postgresql://.../velnoxia_dev npx tsx prisma/<script>.ts\n",
    );
    process.exit(1);
  }

  let host = "";
  let porta = "";
  let banco = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    porta = u.port;
    banco = u.pathname.replace(/^\//, "");
  } catch {
    console.error(
      `\nRECUSADO: DATABASE_URL não é uma URL válida.\n\n` +
        `  Sem conseguir ler o host, não há como afirmar que o banco é local —\n` +
        `  e na dúvida este script não roda.\n`,
    );
    process.exit(1);
  }

  if (!HOSTS_LOCAIS.includes(host)) {
    console.error(
      `\nRECUSADO: este script só roda contra banco local.\n\n` +
        `  host encontrado: ${host}${porta ? ":" + porta : ""}${banco ? "/" + banco : ""}\n` +
        `  hosts aceitos:   ${HOSTS_LOCAIS.join(", ")}\n\n` +
        `  O .env da raiz aponta para PRODUÇÃO. Se ele está carregado nesta\n` +
        `  janela, é o banco dos clientes que está do outro lado desta conexão.\n\n` +
        `  Para rodar no banco de desenvolvimento:\n\n` +
        `    DATABASE_URL="$(grep '^DATABASE_URL' .env.development | cut -d= -f2- | tr -d '\"')" \\\n` +
        `      npx tsx prisma/<script>.ts\n`,
    );
    process.exit(1);
  }

  console.log(`[prisma] banco: ${host}:${porta}/${banco} — local, não é produção`);
  return url;
}
