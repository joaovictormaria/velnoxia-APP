import { ReviewCard } from "@/components/site/pizzaria2/ReviewCard";
import type { Review } from "@/lib/pizzaria2/reviews-provider";

/**
 * A avaliação como o visitante a vê, com a resposta que está sendo escrita.
 *
 * Esta é a única tela em que o dono não escreve o conteúdo — quem escreve é o
 * cliente. O que ele faz aqui é responder, e a resposta aparece pública,
 * embaixo da crítica, para qualquer um que abra a loja. Ver isso enquanto
 * escreve muda o tom do que se escreve.
 */
export function RespostaDaPrevia({
  avaliacao,
  resposta,
}: {
  avaliacao: {
    id: string;
    customerNameSnapshot: string;
    rating: number;
    comment: string;
    createdAt: string | Date;
    response: string | null;
  };
  /** O texto sendo digitado agora; vazio cai na resposta já salva. */
  resposta: string;
}) {
  const comRascunho = {
    ...avaliacao,
    response: resposta.trim() ? resposta : avaliacao.response,
    likeCount: 0,
    likedByMe: false,
  } as unknown as Review;

  return (
    <div className="bg-cream p-8">
      <div className="mx-auto max-w-lg">
        <ReviewCard review={comRascunho} onLike={() => {}} canLike={false} />
      </div>
    </div>
  );
}
