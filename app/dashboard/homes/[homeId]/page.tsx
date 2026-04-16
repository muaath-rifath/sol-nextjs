import { solCore } from "@/lib/sol-core"
import Link from "next/link"
import { redirect, unstable_rethrow } from "next/navigation"

type HomeDetailSearchParams = Promise<{
  notice?: string
  error?: string
}>

function pageHref(homeID: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue
    query.set(key, value)
  }
  const encoded = query.toString()
  return encoded ? `/dashboard/homes/${homeID}?${encoded}` : `/dashboard/homes/${homeID}`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return "Something went wrong"
}

export default async function HomeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ homeId: string }>
  searchParams: HomeDetailSearchParams
}) {
  const { homeId } = await params
  const query = await searchParams

  const [home, rooms] = await Promise.all([solCore.homes.get(homeId), solCore.rooms.list(homeId)])

  const roomDeviceCounts = new Map<string, number>()
  await Promise.all(
    rooms.map(async (room) => {
      try {
        const devices = await solCore.rooms.devices.list(homeId, room.id)
        roomDeviceCounts.set(room.id, devices.length)
      } catch {
        roomDeviceCounts.set(room.id, 0)
      }
    }),
  )

  async function addRoomAction(formData: FormData) {
    "use server"
    const name = String(formData.get("name") ?? "").trim()
    const floorRaw = String(formData.get("floor") ?? "").trim()
    const floor = floorRaw ? Number(floorRaw) : undefined

    if (!name) {
      redirect(pageHref(homeId, { error: "Room name is required" }))
    }

    try {
      await solCore.rooms.create(homeId, {
        name,
        floor: Number.isFinite(floor) ? floor : undefined,
      })
      redirect(pageHref(homeId, { notice: "Room created" }))
    } catch (error) {
      unstable_rethrow(error)
      redirect(pageHref(homeId, { error: errorMessage(error) }))
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eefdf6_0%,#f7fffc_45%,#fff8f1_100%)] px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-3xl border border-emerald-200 bg-white/85 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Home</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">{home.name}</h1>
          <p className="mt-2 text-sm text-stone-600">
            {home.member_count ?? 0} members · your role: {home.my_role ?? "member"}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 font-semibold text-emerald-800">
              Rooms
            </span>
            <Link href={`/dashboard?home=${home.id}`} className="rounded-full border border-stone-300 px-3 py-1 text-stone-700">
              Members
            </Link>
            <Link href={`/dashboard/homes/${home.id}/firmware`} className="rounded-full border border-stone-300 px-3 py-1 text-stone-700">
              Firmware
            </Link>
            <Link href="/dashboard" className="rounded-full border border-stone-300 px-3 py-1 text-stone-700">
              Settings
            </Link>
          </div>
        </header>

        {query.notice ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{query.notice}</p>
        ) : null}
        {query.error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{query.error}</p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-stone-200 bg-white/90 p-5">
            <h2 className="text-lg font-semibold text-stone-900">Add Room</h2>
            <form action={addRoomAction} className="mt-3 space-y-3">
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. Living Room"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                name="floor"
                placeholder="Optional floor"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Create room
              </button>
            </form>
          </aside>

          <section className="rounded-3xl border border-stone-200 bg-white/90 p-5">
            <h2 className="text-lg font-semibold text-stone-900">Rooms</h2>
            {rooms.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
                No rooms yet.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rooms.map((room) => (
                  <article key={room.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-stone-900">{room.name}</h3>
                    <p className="mt-1 text-xs text-stone-600">
                      Floor {room.floor ?? "-"} · {roomDeviceCounts.get(room.id) ?? 0} device(s)
                    </p>
                    <Link
                      href={`/dashboard/homes/${homeId}/rooms/${room.id}`}
                      className="mt-3 inline-flex rounded-full border border-teal-300 px-3 py-1 text-xs font-semibold text-teal-700"
                    >
                      View
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  )
}
