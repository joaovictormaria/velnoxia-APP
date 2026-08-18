import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { getVisitorId } from "@/lib/pizzaria2/visitor-id";
import { useStore } from "@/lib/pizzaria2/store-provider";
import { listLikedPostsFn, togglePostLikeFn } from "@/server/functions/post-likes.fn";
import { cn } from "@/lib/utils";

type Post = {
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

/**
 * The store's own updates. A store with nothing to say shows nothing — an empty
 * "Novidades" heading reads as neglect, while its absence reads as deliberate.
 */
export function StoreBlog({ posts }: { posts: Post[] }) {
  if (posts.length === 0) return null;
  return <Blog posts={posts} />;
}

function Blog({ posts }: { posts: Post[] }) {
  const { storeName, slug: storeSlug } = useStore();
  const [visitorId, setVisitorId] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(posts.map((p) => [p.id, p.likeCount ?? 0])),
  );
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  // The server render knows the totals but not who is reading, so the filled
  // hearts arrive after hydration.
  useEffect(() => {
    const id = getVisitorId();
    setVisitorId(id);
    if (!id) return;
    listLikedPostsFn({ data: { storeSlug, visitorId: id } })
      .then((ids) => setLiked(Object.fromEntries(ids.map((postId) => [postId, true]))))
      .catch(() => undefined);
  }, [storeSlug]);

  function flip(postId: string) {
    setLiked((prev) => ({ ...prev, [postId]: !prev[postId] }));
    setCounts((prev) => ({
      ...prev,
      [postId]: Math.max(0, (prev[postId] ?? 0) + (liked[postId] ? -1 : 1)),
    }));
  }

  async function like(postId: string) {
    if (!visitorId) return;
    flip(postId);
    try {
      const res = await togglePostLikeFn({ data: { storeSlug, postId, visitorId } });
      if (res.ok) {
        setLiked((prev) => ({ ...prev, [postId]: res.likedByMe }));
        setCounts((prev) => ({ ...prev, [postId]: res.likeCount }));
      } else {
        flip(postId);
      }
    } catch {
      flip(postId);
    }
  }

  return (
    <section id="novidades" className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24 xl:px-10">
      <div className="mx-auto max-w-[1800px]">
        <Reveal variant="up">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tomato">
            <span className="h-1.5 w-1.5 rounded-full bg-tomato" />
            Novidades
          </span>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-charcoal sm:text-4xl">
            Blog da {storeName}
          </h2>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <Reveal key={post.id} variant="up" delay={Math.min(i * 60, 300)}>
              <article className="flex h-full flex-col overflow-hidden rounded-[24px] border border-charcoal/8 bg-mozzarella shadow-[0_20px_50px_-35px_rgba(23,23,23,0.35)]">
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="aspect-video w-full object-cover"
                  />
                )}
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <p className="text-xs text-charcoal/45">
                    {dateFormat.format(new Date(post.publishedAt))}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-bold leading-snug text-charcoal">
                    {post.title}
                  </h3>
                  {/* whitespace-pre-line keeps the paragraph breaks the owner
                      typed in the panel, without accepting any markup. */}
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-charcoal/65">
                    {post.body}
                  </p>

                  {/* mt-auto pins the heart to the bottom, so cards of different
                      text lengths still line their buttons up. */}
                  <button
                    type="button"
                    onClick={() => like(post.id)}
                    disabled={!visitorId}
                    aria-pressed={!!liked[post.id]}
                    className={cn(
                      "mt-auto inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      liked[post.id]
                        ? "border-tomato/30 bg-tomato/10 text-tomato"
                        : "border-charcoal/12 text-charcoal/55 hover:border-tomato/30 hover:text-tomato",
                    )}
                  >
                    <Heart className={cn("h-3.5 w-3.5", liked[post.id] && "fill-tomato")} />
                    {(counts[post.id] ?? 0) > 0 ? counts[post.id] : "Curtir"}
                  </button>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
