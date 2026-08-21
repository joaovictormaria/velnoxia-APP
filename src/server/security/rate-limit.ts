import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";

/**
 * Limitador de tentativas por origem, em memória.
 *
 * Existe porque nenhum endpoint público tinha teto: o login aceitava força
 * bruta de senha sem parar, e o checkout deixava encher o painel de uma loja
 * com pedidos falsos. Um humano nunca chega perto dos limites daqui; um script
 * chega na primeira rajada.
 *
 * Em memória de propósito: para uma instância única no Railway basta, e não
 * traz dependência de Redis para um problema que hoje não tem esse tamanho. O
 * custo é conhecido e está anotado onde importa (ver `dentroDoLimite`).
 */
type Janela = { contagem: number; reinicia: number };
const janelas = new Map<string, Janela>();

/*
 * Sem esta limpeza o Map cresceria com cada IP que já passou, para sempre. Um
 * varredura barata a cada minuto tira o que já expirou; roda uma vez só, no
 * primeiro import, e não segura o processo de encerrar.
 */
const LIMPEZA_MS = 60_000;
const limpeza = setInterval(() => {
  const agora = Date.now();
  for (const [chave, janela] of janelas) {
    if (agora > janela.reinicia) janelas.delete(chave);
  }
}, LIMPEZA_MS);
limpeza.unref?.();

/**
 * Devolve `true` se a chamada PODE seguir, `false` se estourou o limite na
 * janela atual. Cada chamada que passa conta como uma tentativa.
 *
 * A memória não sobrevive a um redeploy nem é compartilhada entre instâncias:
 * numa arquitetura de várias réplicas isto vira uma barreira porosa, e aí o
 * lugar certo passa a ser um contador em Redis. Para o desenho de hoje —
 * instância única — segura o que precisa segurar.
 */
export function dentroDoLimite(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const atual = janelas.get(chave);
  if (!atual || agora > atual.reinicia) {
    janelas.set(chave, { contagem: 1, reinicia: agora + janelaMs });
    return true;
  }
  if (atual.contagem >= max) return false;
  atual.contagem += 1;
  return true;
}

/**
 * Quem está chamando, para servir de chave do limite.
 *
 * Atrás do proxy do Railway o IP real vem no X-Forwarded-For; sem ele, todas
 * as chamadas pareceriam vir do mesmo endereço interno e um único abusador
 * derrubaria o acesso de todo mundo. O fallback nunca é vazio: sem IP algum, o
 * limite passa a valer globalmente para aquele endpoint, que falha fechado em
 * vez de aberto.
 */
export function origemDaChamada(): string {
  const ip = getRequestIP({ xForwardedFor: true });
  if (ip) return ip;
  // Alguns proxies só mandam o cabeçalho, sem o helper resolver o IP.
  const encaminhado = getRequestHeader("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0]!.trim();
  return "sem-origem";
}

/**
 * Açúcar para o caso comum: monta a chave com o nome do endpoint e a origem,
 * e devolve se pode seguir. Endpoints diferentes têm contadores separados,
 * senão gastar o limite do login zeraria o do checkout.
 */
export function permitido(
  endpoint: string,
  opcoes: { max: number; janelaMs: number },
): boolean {
  return dentroDoLimite(`${endpoint}:${origemDaChamada()}`, opcoes.max, opcoes.janelaMs);
}
