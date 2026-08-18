import { Reveal } from "@/components/site/Reveal";

type Post = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: string | Date;
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

  return (
    <section id="novidades" className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="mx-auto max-w-[1200px]">
        <Reveal variant="up">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tomato">
            <span className="h-1.5 w-1.5 rounded-full bg-tomato" />
            Novidades
          </span>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-charcoal sm:text-4xl">
            O que anda acontecendo por aqui
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
                    className="aspect-16/9 w-full object-cover"
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
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
