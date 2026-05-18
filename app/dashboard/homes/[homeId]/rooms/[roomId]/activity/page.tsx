import { solCore } from "@/lib/sol-core"
import ActivityFeed from "@/components/ActivityFeed"
import Link from "next/link"
import { redirect } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"

export const dynamic = "force-dynamic"

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ homeId: string; roomId: string }>
}) {
  const { homeId, roomId } = await params

  const roomResult = await solCore.rooms.get(homeId, roomId).catch(() => null)
  if (!roomResult) {
    redirect(`/dashboard/homes/${homeId}?error=Room+not+found`)
  }
  const room = roomResult

  const firstPage = await solCore.rooms
    .activity(homeId, roomId, { limit: 20 })
    .catch(() => ({ data: [], has_more: false, next_cursor: null }))

  return (
    <div className="px-2 py-6 sm:px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href={`/dashboard/homes/${homeId}/rooms/${roomId}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/45 bg-surface-container text-on-surface shadow-[2px_2px_6px_rgba(87,66,62,0.07),-2px_-2px_6px_rgba(255,255,255,0.8)] hover:bg-surface-container-high transition-colors"
          >
            <IconArrowLeft size={16} />
          </Link>
          <div>
            <p className="text-xs text-outline">{room.name}</p>
            <h1 className="font-display text-xl font-semibold text-on-surface">Activity Log</h1>
          </div>
        </div>

        <section className="rounded-3xl border border-white/45 bg-surface-container p-5 shadow-[8px_8px_16px_rgba(87,66,62,0.05),-8px_-8px_16px_rgba(255,255,255,0.8)]">
          <ActivityFeed
            homeId={homeId}
            roomId={roomId}
            initialData={firstPage.data}
            initialNextCursor={firstPage.next_cursor}
            initialHasMore={firstPage.has_more}
          />
        </section>
      </div>
    </div>
  )
}
