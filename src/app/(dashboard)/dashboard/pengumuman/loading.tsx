import { SkeletonHeader, SkeletonList } from '@/components/ui/skeleton'

export default function DashboardPengumumanLoading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonList count={3} />
    </div>
  )
}