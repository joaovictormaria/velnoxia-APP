import { useEffect, useState } from "react";
import { Reveal } from "@/components/site/Reveal";
import { getVisitorId } from "@/lib/pizzaria2/visitor-id";
import { useStore } from "@/lib/pizzaria2/store-provider";
import {
  listLikedPostsFn,
  togglePostLikeFn,
} from "@/server/functions/post-likes.fn";
import { PostCard, type Post } from "./PostCard";
import { Marquee } from "./Marquee";

/** Above this many, the grid stops fitting on one desktop row and the strip
 *  takes over. On a phone the strip is used from two posts on. */
const DESKTOP_GRID_MAX = 4;

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
      .then((ids) =>
        setLiked(Object.fromEntries(ids.map((postId) => [postId, true]))),
      )
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
      const res = await togglePostLikeFn({
        data: { storeSlug, postId, visitorId },
      });
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

  const card = (post: Post) => (
    <PostCard
      post={post}
      likeCount={counts[post.id] ?? 0}
      liked={!!liked[post.id]}
      onLike={() => like(post.id)}
      canLike={!!visitorId}
    />
  );

  const strip = (className?: string) => (
    <Marquee
      items={posts}
      keyOf={(p) => p.id}
      label={`Novidades de ${storeName}`}
      className={className}
      itemClassName="w-64 sm:w-85"
      renderItem={card}
    />
  );

  const grid = (className: string) => (
    <div className={className}>
      {posts.map((post, i) => (
        <Reveal key={post.id} variant="up" delay={Math.min(i * 60, 300)}>
          {card(post)}
        </Reveal>
      ))}
    </div>
  );

  /**
   * One post has nothing to slide past, so it stays put on every screen. From
   * two on, a phone always gets the strip. A desktop keeps the grid while the
   * posts still fit one row, and switches to the strip past that.
   */
  const single = posts.length === 1;
  const alwaysStrip = posts.length > DESKTOP_GRID_MAX;

  return (
    <section
      id="novidades"
      className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24 xl:px-10"
    >
      <div className="mx-auto max-w-[1800px] rounded-[32px] bg-tomato/25 p-6 sm:p-10">
        <Reveal variant="up">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tomato">
            <span className="h-1.5 w-1.5 rounded-full bg-tomato" />
            Novidades
          </span>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-charcoal sm:text-4xl">
            Blog da {storeName}
          </h2>
        </Reveal>

        <div className="mt-8">
          {single ? (
            grid("grid grid-cols-1 gap-5 sm:max-w-md")
          ) : alwaysStrip ? (
            strip()
          ) : (
            <>
              {/* Two layouts, one of them hidden by CSS rather than by a media
                  query in JS — the server has no window to measure, and guessing
                  would make the first paint jump. */}
              {strip("lg:hidden")}
              {grid("hidden gap-5 lg:grid lg:grid-cols-3 xl:grid-cols-4")}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
