import { Skeleton, SkeletonList } from '@/components/ui/skeleton'

export default function WargaRondaLoading() {
  return (
    <div className="space-y-4 pb-6">
      {/* Header skeleton */}
      <div className="rounded-3xl bg-gradient-to-br from-amber-500/40 via-orange-500/40 to-rose-500/40 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-2xl" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
        <Skeleton className="h-4 w-64 mt-3" />
      </div>

      {/* Window card skeleton */}
      <Skeleton className="h-20 rounded-2xl" />

      {/* Jadwal list skeleton */}
      <div>
        <Skeleton className="h-4 w-32 mb-3" />
        <SkeletonList count={4} />
      </div>
    </div>
  )
}
