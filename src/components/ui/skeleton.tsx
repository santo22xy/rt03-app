import { cn } from '@/lib/utils'

/**
 * Skeleton primitives untuk loading state.
 * Pakai shimmer animation yang ringan — disable-able via prefers-reduced-motion.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        // Reduced motion: gunakan opacity subtle tanpa animasi
        'motion-reduce:animate-none motion-reduce:opacity-70',
        className,
      )}
      {...props}
    />
  )
}

/** Skeleton untuk card dengan layout konsisten */
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full" />
      ))}
    </div>
  )
}

/** Skeleton untuk list (untuk halaman dengan banyak item) */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton untuk header page */
export function SkeletonHeader() {
  return (
    <div className="space-y-2 mb-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  )
}