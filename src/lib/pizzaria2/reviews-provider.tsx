import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getVisitorId } from "./visitor-id";
import {
  listReviewsFn,
  submitReviewFn,
  toggleReviewLikeFn,
} from "@/server/functions/reviews.fn";

export type Review = Awaited<
  ReturnType<typeof listReviewsFn>
>["reviews"][number];

type ReviewsApi = {
  visitorId: string;
  reviews: Review[];
  summary: { average: number; total: number };
  like: (reviewId: string) => void;
  submit: (input: {
    name: string;
    rating: number;
    comment: string;
  }) => Promise<string | null>;
};

const ReviewsContext = createContext<ReviewsApi | null>(null);

/**
 * The reviews are read in two places — the list inside the "Nosso restaurante"
 * card and the moving strip below it. They share one provider so a heart filled
 * in one place is filled in the other, instead of two copies drifting apart.
 */
export function ReviewsProvider({
  storeSlug,
  children,
}: {
  storeSlug: string;
  children: React.ReactNode;
}) {
  const [visitorId, setVisitorId] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ average: 0, total: 0 });

  // localStorage only exists after hydration, so the id is read in an effect —
  // reading it while rendering would break the server render.
  useEffect(() => {
    const id = getVisitorId();
    setVisitorId(id);
    listReviewsFn({ data: { storeSlug, visitorId: id || null } })
      .then((r) => {
        setReviews(r.reviews);
        setSummary(r.summary);
      })
      .catch(() => undefined);
  }, [storeSlug]);

  const flip = useCallback((reviewId: string) => {
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId
          ? {
              ...r,
              likedByMe: !r.likedByMe,
              likeCount: Math.max(0, r.likeCount + (r.likedByMe ? -1 : 1)),
            }
          : r,
      ),
    );
  }, []);

  const like = useCallback(
    (reviewId: string) => {
      if (!visitorId) return;
      // Optimistic: the heart answers immediately and the server number replaces
      // it a moment later. Waiting on a round trip to fill a heart feels broken.
      flip(reviewId);
      toggleReviewLikeFn({ data: { storeSlug, reviewId, visitorId } })
        .then((res) => {
          if (!res.ok) {
            flip(reviewId);
            return;
          }
          setReviews((prev) =>
            prev.map((r) =>
              r.id === reviewId
                ? { ...r, likedByMe: res.likedByMe, likeCount: res.likeCount }
                : r,
            ),
          );
        })
        .catch(() => flip(reviewId));
    },
    [flip, storeSlug, visitorId],
  );

  const submit = useCallback<ReviewsApi["submit"]>(
    async (input) => {
      if (!visitorId) return "Ative o armazenamento do navegador para avaliar.";
      try {
        const res = await submitReviewFn({
          data: { storeSlug, visitorId, ...input },
        });
        if (!res.ok) return res.error;
        const fresh = await listReviewsFn({ data: { storeSlug, visitorId } });
        setReviews(fresh.reviews);
        setSummary(fresh.summary);
        return null;
      } catch {
        return "Não foi possível enviar sua avaliação. Tente de novo.";
      }
    },
    [storeSlug, visitorId],
  );

  const value = useMemo(
    () => ({ visitorId, reviews, summary, like, submit }),
    [visitorId, reviews, summary, like, submit],
  );

  return (
    <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>
  );
}

export function useReviews(): ReviewsApi {
  const ctx = useContext(ReviewsContext);
  if (!ctx)
    throw new Error("useReviews precisa estar dentro de ReviewsProvider");
  return ctx;
}
