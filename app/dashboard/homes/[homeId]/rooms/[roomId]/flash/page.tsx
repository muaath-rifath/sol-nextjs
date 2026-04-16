import Flasher from "@/components/Flasher"
import { solCore } from "@/lib/sol-core"
import Link from "next/link"

export default async function FlashPage({
  params,
}: {
  params: Promise<{ homeId: string; roomId: string }>
}) {
  const { homeId, roomId } = await params
  const [room, devices, firmwareVersions] = await Promise.all([
    solCore.rooms.get(homeId, roomId),
    solCore.rooms.devices.list(homeId, roomId),
    solCore.firmware.list(),
  ])

  const flashDevices = devices.map((d) => ({ id: d.id, name: d.name, room_id: d.room_id }))
  const flashFirmware = firmwareVersions.map((f) => ({
    id: f.id,
    template_id: f.template_id,
    version: f.version,
  }))

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f2f8ff_0%,#f9fffd_45%,#fff8ef_100%)] px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="rounded-3xl border border-stone-200 bg-white/90 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Flasher</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">{room.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/dashboard/homes/${homeId}/rooms/${roomId}`}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-sm text-stone-700"
            >
              Back to room
            </Link>
            <Link
              href={`/dashboard/homes/${homeId}/firmware`}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-sm text-stone-700"
            >
              Manage firmware
            </Link>
          </div>
        </header>

        <Flasher firmwareVersions={flashFirmware} devices={flashDevices} />
      </div>
    </div>
  )
}
