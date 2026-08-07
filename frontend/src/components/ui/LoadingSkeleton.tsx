// Loading skeleton components for StellarUrithi-Bidz pages.
// Provides shimmer placeholders that match the layout of real content,
// reducing perceived load time and layout shift.

// ── Shared primitives ─────────────────────────────────────────────────────────────

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/[0.04] ${className}`}
      aria-hidden="true"
    />
  );
}

// ── Auction Card Skeleton ─────────────────────────────────────────────────────────

/** Placeholder matching <AuctionCard /> layout */
export function AuctionCardSkeleton() {
  return (
    <div className="glass-card p-5 space-y-4">
      <SkeletonBar className="h-48 w-full rounded-xl" />
      <div className="space-y-2">
        <SkeletonBar className="h-5 w-3/4" />
        <SkeletonBar className="h-4 w-1/2" />
      </div>
      <div className="flex gap-2">
        <SkeletonBar className="h-6 w-16 rounded-full" />
        <SkeletonBar className="h-6 w-20 rounded-full" />
      </div>
      <div className="flex justify-between items-center">
        <SkeletonBar className="h-4 w-24" />
        <SkeletonBar className="h-8 w-28 rounded-xl" />
      </div>
    </div>
  );
}

/** Grid of auction card skeletons */
export function AuctionGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }, (_, i) => (
        <AuctionCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Auction Detail Skeleton ───────────────────────────────────────────────────────

/** Placeholder matching auction [id] detail page layout */
export function AuctionDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Breadcrumb */}
      <SkeletonBar className="h-4 w-48" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content — 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image placeholder */}
          <SkeletonBar className="h-72 w-full rounded-2xl" />

          {/* Title + badges */}
          <div className="space-y-3">
            <SkeletonBar className="h-8 w-3/4" />
            <div className="flex gap-2">
              <SkeletonBar className="h-6 w-20 rounded-full" />
              <SkeletonBar className="h-6 w-24 rounded-full" />
              <SkeletonBar className="h-6 w-16 rounded-full" />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <SkeletonBar className="h-4 w-full" />
            <SkeletonBar className="h-4 w-5/6" />
            <SkeletonBar className="h-4 w-2/3" />
          </div>

          {/* Bid history */}
          <div className="space-y-3">
            <SkeletonBar className="h-6 w-32" />
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex justify-between py-2">
                <SkeletonBar className="h-4 w-32" />
                <SkeletonBar className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar — 1/3 */}
        <div className="space-y-4">
          <SkeletonBar className="h-48 w-full rounded-xl" />
          <SkeletonBar className="h-12 w-full rounded-xl" />
          <SkeletonBar className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ── Create Auction Skeleton ────────────────────────────────────────────────────────

/** Placeholder matching create auction page stepper layout */
export function CreateAuctionSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <SkeletonBar className="h-8 w-64" />
        <SkeletonBar className="h-4 w-96" />
      </div>

      {/* Progress steps */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonBar key={i} className="h-10 flex-1 rounded-xl" />
        ))}
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <SkeletonBar className="h-12 w-full rounded-xl" />
        <SkeletonBar className="h-12 w-full rounded-xl" />
        <SkeletonBar className="h-12 w-3/4 rounded-xl" />
        <SkeletonBar className="h-12 w-1/2 rounded-xl" />
        <SkeletonBar className="h-32 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ── My Bids Skeleton ──────────────────────────────────────────────────────────────

/** Placeholder matching my-bids page */
export function MyBidsSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Title */}
      <SkeletonBar className="h-8 w-48" />

      {/* Bid rows */}
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <SkeletonBar className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-3 w-24" />
          </div>
          <SkeletonBar className="h-6 w-20 rounded-full" />
          <SkeletonBar className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// ── Page Skeleton ─────────────────────────────────────────────────────────────────

/** Generic page skeleton with hero + grid */
export function PageSkeleton() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-4">
        <SkeletonBar className="h-12 w-2/3" />
        <SkeletonBar className="h-5 w-1/2" />
        <div className="flex gap-2 mt-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBar key={i} className="h-8 w-24 rounded-xl" />
          ))}
        </div>
      </div>
      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <AuctionGridSkeleton count={6} />
      </div>
    </div>
  );
}
