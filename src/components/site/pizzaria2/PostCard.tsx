import { Heart } from "lucide-react";
import { useGoToCardapio } from "@/lib/pizzaria2/go-to-cardapio";
import { cn } from "@/lib/utils";

export type Post = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: string | Date;
  likeCount?: number;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export function PostCard({
  post,
  likeCount,
  liked,
  onLike,
  canLike,
}: {
  post: Post;
  likeCount: number;
  liked: boolean;
  onLike: () => void;
  canLike: boolean;
}) {
  const goToCardapio = useGoToCardapio();

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[24px] border border-charcoal/8 bg-mozzarella shadow-[0_20px_50px_-35px_rgba(23,23,23,0.35)]">
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt={post.title}
          className="aspect-video w-full object-cover"
        />
      )}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="text-xs text-charcoal/45">
          {dateFormat.format(new Date(post.publishedAt))}
        </p>
        <h3 className="mt-2 font-display text-base font-bold leading-snug text-charcoal">
          {post.title}
        </h3>
        {/* whitespace-pre-line keeps the paragraph breaks the owner typed in the
            panel, without accepting any markup. */}
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-charcoal/65">
          {post.body}
        </p>

        {/* mt-auto pins the row to the bottom, so cards of different text
            lengths still line their buttons up. */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <button
            type="button"
            onClick={goToCardapio}
            className="inline-flex items-center gap-1.5 rounded-full bg-tomato px-4 py-1.5 text-xs font-semibold text-[color:var(--on-primary)] shadow-sm transition-transform hover:scale-[1.04]"
          >
            Comprar o meu →
          </button>

          <button
            type="button"
            onClick={onLike}
            disabled={!canLike}
            aria-pressed={liked}
            className={cn(
              "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              liked
                ? "border-tomato/30 bg-tomato/10 text-tomato"
                : "border-charcoal/12 text-charcoal/55 hover:border-tomato/30 hover:text-tomato",
            )}
          >
            <Heart className={cn("h-3.5 w-3.5", liked && "fill-tomato")} />
            {likeCount > 0 ? likeCount : "Curtir"}
          </button>
        </div>
      </div>
    </article>
  );
}
