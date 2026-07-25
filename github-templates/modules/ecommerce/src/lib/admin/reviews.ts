// Admin-side product reviews — moderation queue.
// Lifted from `02 felicias aqua portal work/src/lib/admin/reviews.ts`.

export type ReviewStatus = "pending" | "published" | "spam" | "rejected";

export interface ProductReviewRecord {
  id: string;
  productSlug: string;
  authorName: string;
  authorEmail?: string;
  rating: number;                // 1-5
  title?: string;
  body: string;
  status: ReviewStatus;
  verifiedBuyer?: boolean;
  createdAt: number;
  publishedAt?: number;
}

export interface ReviewListFilter {
  status?: ReviewStatus;
  productSlug?: string;
  minRating?: number;
}

export function filterReviews(reviews: ProductReviewRecord[], filter: ReviewListFilter): ProductReviewRecord[] {
  let out = reviews;
  if (filter.status) out = out.filter(r => r.status === filter.status);
  if (filter.productSlug) out = out.filter(r => r.productSlug === filter.productSlug);
  if (filter.minRating) out = out.filter(r => r.rating >= filter.minRating!);
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function reviewStats(reviews: ProductReviewRecord[]): { total: number; avg: number; pending: number } {
  const published = reviews.filter(r => r.status === "published");
  const pending = reviews.filter(r => r.status === "pending").length;
  if (published.length === 0) return { total: 0, avg: 0, pending };
  const avg = published.reduce((s, r) => s + r.rating, 0) / published.length;
  return { total: published.length, avg: Math.round(avg * 10) / 10, pending };
}
