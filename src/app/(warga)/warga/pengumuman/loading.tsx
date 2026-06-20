import { SkeletonHeader, SkeletonCard } from '@/components/ui/skeleton'

export default function WargaPengumumanLoading() {
  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <SkeletonCard rows={2} />
      <SkeletonCard rows={3} />
      <SkeletonCard rows={2} />
    </div>
  )
}