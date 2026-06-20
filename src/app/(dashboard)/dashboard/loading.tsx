import { SkeletonHeader, SkeletonList } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
        ))}
      </div>
      <SkeletonList count={4} />
    </div>
  )
}