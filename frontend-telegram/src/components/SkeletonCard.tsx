export default function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <div className="skeleton-shimmer aspect-square w-full" />
      <div className="flex flex-col gap-2 p-3">
        <div className="skeleton-shimmer h-3.5 w-3/4 rounded-full" />
        <div className="skeleton-shimmer h-3 w-full rounded-full" />
        <div className="skeleton-shimmer mt-1 h-4 w-1/2 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
